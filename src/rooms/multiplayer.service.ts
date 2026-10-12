import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';
import { RoomsService } from './rooms.service';
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

  constructor(rooms: RoomsService, validator: TuttiFruttiValidatorService) {
    this.engine = new GameEngine(
      rooms,
      validator,
      { sendState: (userId, state) => this.emitToUser(userId, 'room:state', state) },
      (msg) => this.logger.warn(msg),
    );
    this.queue = new Matchmaking(
      (userIds, settings) => this.engine.createQueueRoom(userIds, settings),
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

  private emitToUser(userId: string, event: string, payload: RoomSnapshot | QueueState | { code: string }) {
    this.server?.to(`u:${userId}`).emit(event, payload);
  }
}
