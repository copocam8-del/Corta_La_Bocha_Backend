import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';
import { RoomsService } from './rooms.service';
import { ContenidoVistoService } from '../games/contenido-visto.service';
import { GameEngine, type RoomSnapshot } from './game-engine';
import { Matchmaking, type QueueState } from './matchmaking';

// Une el motor (game-engine.ts) y la cola pública (matchmaking.ts) con Nest y Socket.IO.
// Cada usuario tiene su "sala" de Socket.IO `u:<userId>`: ahí le llega su estado (cada jugador ve
// sus propias respuestas, por eso el estado se arma por jugador).
@Injectable()
export class MultiplayerService {
  private readonly logger = new Logger('Multijugador');
  private server: Server | null = null;
  readonly engine: GameEngine;
  readonly queue: Matchmaking;

  constructor(rooms: RoomsService, validator: TuttiFruttiValidatorService, vistos: ContenidoVistoService) {
    this.engine = new GameEngine(
      rooms,
      validator,
      { sendState: (userId, state) => this.emitToUser(userId, 'room:state', state) },
      (msg) => this.logger.warn(msg),
      vistos,
    );
    this.queue = new Matchmaking(
      (userIds, settings, game) => this.engine.createQueueRoom(userIds, settings, game),
      {
        sendQueueState: (userId, state: QueueState) => this.emitToUser(userId, 'queue:state', state),
        sendMatched: (userId, code) => this.emitToUser(userId, 'queue:matched', { code }),
      },
      (msg) => this.logger.warn(msg),
    );
  }

  attachServer(server: Server) {
    this.server = server;
  }

  // Borró su cuenta: sale de la cola y de todas sus salas, y se cortan sus conexiones de Socket.IO
  async expulsarUsuario(userId: string) {
    this.queue.leave(userId);
    await this.engine.removeUser(userId);
    this.server?.in(`u:${userId}`).disconnectSockets(true);
  }

  private emitToUser(userId: string, event: string, payload: RoomSnapshot | QueueState | { code: string }) {
    this.server?.to(`u:${userId}`).emit(event, payload);
  }
}
