import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { MultiplayerService } from './multiplayer.service';

// Mismos orígenes que HTTP (CORS_ORIGIN). Se lee en cada conexión porque el .env se carga después
// de que se evalúan los decoradores.
function allowedOrigin(origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) {
  const list = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];
  cb(null, !origin || list.length === 0 || list.includes(origin));
}

interface SocketData {
  userId: string;
  username: string;
  rooms: Set<string>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// Tiempo real del multijugador. Toda conexión se autentica con el JWT (el mismo del login), que
// llega en el handshake: io(url, { auth: { token } }). Sin token válido, se corta la conexión.
// El userId sale SIEMPRE del token, nunca de lo que manda el cliente.
@WebSocketGateway({ cors: { origin: allowedOrigin } })
export class RoomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomsGateway.name);
  // Conexiones abiertas por (sala, usuario): si recarga la página, la nueva entra antes de que
  // se cierre la vieja; sólo cuando no queda ninguna se lo marca desconectado
  private readonly openSockets = new Map<string, number>();
  private readonly socketsPerUser = new Map<string, number>();

  constructor(
    private readonly multiplayer: MultiplayerService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.multiplayer.attachServer(server);
    // Se verifica el token ANTES de aceptar la conexión (si no, un evento podría llegar antes)
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then(() => next())
        .catch(() => next(new Error('Tu sesión venció. Volvé a iniciar sesión.')));
    });
  }

  private async authenticate(socket: Socket) {
    const payload = await this.jwt.verifyAsync<{ sub: string }>(str(socket.handshake.auth?.token));
    const user = await this.prisma.users.findUnique({ where: { id: payload.sub }, select: { id: true, username: true } });
    if (!user) throw new Error('usuario inexistente');
    socket.data = { userId: user.id, username: user.username, rooms: new Set<string>() } satisfies SocketData;
  }

  async handleConnection(client: Socket) {
    const me = client.data as SocketData | undefined;
    if (!me?.userId) {
      client.disconnect(true);
      return;
    }
    await client.join(`u:${me.userId}`);
    this.socketsPerUser.set(me.userId, (this.socketsPerUser.get(me.userId) ?? 0) + 1);
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as SocketData | undefined;
    if (!data?.userId) return;
    const left = (this.socketsPerUser.get(data.userId) ?? 1) - 1;
    if (left <= 0) {
      this.socketsPerUser.delete(data.userId);
      this.multiplayer.queue.leave(data.userId);
    } else this.socketsPerUser.set(data.userId, left);

    for (const code of data.rooms) {
      const key = `${code}|${data.userId}`;
      const n = (this.openSockets.get(key) ?? 1) - 1;
      if (n <= 0) {
        this.openSockets.delete(key);
        await this.multiplayer.engine.disconnect(code, data.userId);
      } else this.openSockets.set(key, n);
    }
  }

  private me(client: Socket) {
    return client.data as SocketData;
  }

  @SubscribeMessage('room:join')
  async join(@MessageBody() body: { code?: string }, @ConnectedSocket() client: Socket) {
    const me = this.me(client);
    const code = str(body?.code).toUpperCase().trim();
    if (!code) return { ok: false, error: 'Falta el código de la sala.' };
    if (me.rooms.has(code)) {
      // Ya estaba: le reenviamos el estado (ej. volvió a montar la pantalla)
      const snap = this.multiplayer.engine.snapshotFor(code, me.userId);
      if (snap) client.emit('room:state', snap);
      return { ok: true, code };
    }
    const res = await this.multiplayer.engine.join(code, { userId: me.userId });
    if (res.ok) {
      me.rooms.add(code);
      const key = `${code}|${me.userId}`;
      this.openSockets.set(key, (this.openSockets.get(key) ?? 0) + 1);
    }
    return res;
  }

  @SubscribeMessage('room:leave')
  async leave(@MessageBody() body: { code?: string }, @ConnectedSocket() client: Socket) {
    const me = this.me(client);
    const code = str(body?.code).toUpperCase();
    me.rooms.delete(code);
    this.openSockets.delete(`${code}|${me.userId}`);
    return this.multiplayer.engine.leave(code, me.userId);
  }

  @SubscribeMessage('room:settings')
  settings(@MessageBody() body: { code?: string; settings?: object }, @ConnectedSocket() client: Socket) {
    return this.multiplayer.engine.updateSettings(str(body?.code).toUpperCase(), this.me(client).userId, body?.settings ?? {});
  }

  @SubscribeMessage('room:start')
  start(@MessageBody() body: { code?: string }, @ConnectedSocket() client: Socket) {
    return this.multiplayer.engine.start(str(body?.code).toUpperCase(), this.me(client).userId);
  }

  @SubscribeMessage('room:again')
  again(@MessageBody() body: { code?: string }, @ConnectedSocket() client: Socket) {
    return this.multiplayer.engine.playAgain(str(body?.code).toUpperCase(), this.me(client).userId);
  }

  @SubscribeMessage('round:answers')
  answers(@MessageBody() body: { code?: string; answers?: unknown; final?: boolean }, @ConnectedSocket() client: Socket) {
    return this.multiplayer.engine.answers(str(body?.code).toUpperCase(), this.me(client).userId, body?.answers, body?.final === true);
  }

  // Juegos nuevos (ahorcado, trivia, sopa, memotest): una acción del jugador. Qué tipos hay y qué
  // datos llevan lo define el modo de cada juego (src/rooms/modes/*.mode.ts).
  @SubscribeMessage('game:action')
  gameAction(@MessageBody() body: { code?: string; type?: string; payload?: unknown }, @ConnectedSocket() client: Socket) {
    return this.multiplayer.engine.action(str(body?.code).toUpperCase(), this.me(client).userId, str(body?.type), body?.payload ?? {});
  }

  @SubscribeMessage('round:basta')
  basta(@MessageBody() body: { code?: string; answers?: unknown }, @ConnectedSocket() client: Socket) {
    return this.multiplayer.engine.basta(str(body?.code).toUpperCase(), this.me(client).userId, body?.answers);
  }

  @SubscribeMessage('queue:join')
  queueJoin(@MessageBody() body: { game?: string; tematica?: string; size?: string }, @ConnectedSocket() client: Socket) {
    const me = this.me(client);
    return this.multiplayer.queue.join({ userId: me.userId, username: me.username }, str(body?.tematica), str(body?.size), str(body?.game) || 'tutti_frutti');
  }

  @SubscribeMessage('queue:leave')
  queueLeave(@ConnectedSocket() client: Socket) {
    this.multiplayer.queue.leave(this.me(client).userId);
    return { ok: true };
  }
}
