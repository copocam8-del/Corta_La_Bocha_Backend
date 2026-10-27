import type { Server } from 'socket.io';
import { MultiplayerService } from './multiplayer.service';
import type { RoomsService } from './rooms.service';
import type { TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';
import type { ContenidoVistoService } from '../games/contenido-visto.service';

describe('MultiplayerService', () => {
  it('al borrar la cuenta: sale de la cola y de las salas, y después se cortan sus conexiones', async () => {
    const mp = new MultiplayerService({} as RoomsService, {} as TuttiFruttiValidatorService, {} as ContenidoVistoService);
    const orden: string[] = [];
    const disconnectSockets = jest.fn(() => orden.push('sockets'));
    const inRoom = jest.fn(() => ({ disconnectSockets }));
    mp.attachServer({ in: inRoom } as unknown as Server);
    jest.spyOn(mp.queue, 'leave').mockImplementation(() => void orden.push('cola'));
    jest.spyOn(mp.engine, 'removeUser').mockImplementation(async () => void orden.push('salas'));

    await mp.expulsarUsuario('u1');

    expect(mp.queue.leave).toHaveBeenCalledWith('u1');
    expect(mp.engine.removeUser).toHaveBeenCalledWith('u1');
    expect(inRoom).toHaveBeenCalledWith('u:u1');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
    expect(orden).toEqual(['cola', 'salas', 'sockets']);
  });
});
