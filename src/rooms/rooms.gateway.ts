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

  constructor(private readonly roomsService: RoomsService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() payload: JoinRoomPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { roomCode, userId, username } = payload;

    // Unimos el socket a una "room" interna de Socket.IO con ese código
    await client.join(roomCode);

    // Avisamos a todos los demás en esa sala (menos a quien acaba de entrar)
    client.to(roomCode).emit('player_joined', { userId, username });

    // Le devolvemos al que entró el estado actual de la sala
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