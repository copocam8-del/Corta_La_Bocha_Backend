import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RoomsService } from './rooms.service';

interface JoinRoomPayload {
  roomCode: string;
  userId: string;
  username: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  // Guardamos los timers activos por roundId, para poder cancelarlos si la ronda se cierra a mano antes
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly roomsService: RoomsService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  emitToRoom(roomCode: string, event: string, payload: any) {
    this.server.to(roomCode).emit(event, payload);
  }

  scheduleRoundAutoClose(
    roomCode: string,
    matchId: string,
    roundId: string,
    seconds: number,
  ) {
    // Si ya había un timer para esta ronda (no debería, pero por seguridad), lo limpiamos
    this.cancelRoundTimer(roundId);

    const timeout = setTimeout(async () => {
      try {
        const result = await this.roomsService.closeRoundForVotingIfStillAnswering(matchId, roundId);
        if (result) {
          this.emitToRoom(roomCode, 'voting_started', result);
          this.logger.log(`Ronda ${roundId} cerrada automáticamente por tiempo`);
        }
      } catch (error) {
        this.logger.error(`Error cerrando ronda ${roundId} automáticamente: ${error.message}`);
      }
      this.activeTimers.delete(roundId);
    }, seconds * 1000);

    this.activeTimers.set(roundId, timeout);
  }

  cancelRoundTimer(roundId: string) {
    const existing = this.activeTimers.get(roundId);
    if (existing) {
      clearTimeout(existing);
      this.activeTimers.delete(roundId);
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() payload: JoinRoomPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { roomCode, userId, username } = payload;

    await client.join(roomCode);

    client.to(roomCode).emit('player_joined', { userId, username });

    const room = await this.roomsService.findByCode(roomCode);
    client.emit('room_state', room);

    this.logger.log(`${username} se unió a la sala ${roomCode}`);
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @MessageBody() payload: { roomCode: string; userId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { roomCode, userId, username } = payload;
    await client.leave(roomCode);
    client.to(roomCode).emit('player_left', { userId, username });
    this.logger.log(`${username} salió de la sala ${roomCode}`);
  }
} 