import { BadRequestException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import type { ContenidoVistoService } from '../games/contenido-visto.service';
import { ImpostorController, PalabrasLocalDto } from './impostor.controller';
import { elegirPalabras, palabrasDe } from './impostor-rules';
import { ImpostorService } from './impostor.service';

// El Impostor "En persona": el endpoint que da las palabras (el resto del juego corre en el navegador)

describe('elegirPalabras (online y en persona)', () => {
  it('una por ronda, sin repetir y de la temática', () => {
    const equipos = palabrasDe('equipos').map((w) => w.texto);
    const elegidas = elegirPalabras('equipos', 5);
    expect(elegidas).toHaveLength(5);
    expect(new Set(elegidas.map((w) => w.texto)).size).toBe(5);
    for (const w of elegidas) expect(equipos).toContain(w.texto);
  });

  it('prioriza las que no vio', () => {
    const todas = palabrasDe('dt').map((w) => w.texto);
    const libres = todas.slice(0, 3);
    const vistos = new Map(todas.slice(3).map((t) => [t, 1]));
    expect(elegirPalabras('dt', 3, vistos).map((w) => w.texto).sort()).toEqual([...libres].sort());
  });
});

describe('ImpostorService.palabrasLocal', () => {
  const armar = (vistos = new Map<string, number>()) => {
    const dep = { leer: jest.fn().mockResolvedValue(vistos), marcar: jest.fn().mockResolvedValue(undefined) };
    return { dep, service: new ImpostorService(dep as unknown as ContenidoVistoService) };
  };

  it('lee y marca lo visto de ESE usuario (game impostor) y devuelve texto + categoría', async () => {
    const { dep, service } = armar();
    const res = await service.palabrasLocal('u1', 'jugadores', 3);
    expect(dep.leer).toHaveBeenCalledWith(['u1'], 'impostor');
    expect(res.palabras).toHaveLength(3);
    for (const p of res.palabras) expect(Object.keys(p).sort()).toEqual(['categoria', 'texto']);
    expect(res.palabras.every((p) => p.categoria === 'Jugador')).toBe(true);
    expect(dep.marcar).toHaveBeenCalledWith(['u1'], 'impostor', res.palabras.map((p) => p.texto));
  });

  it('no repite lo que el usuario ya vio mientras queden sin ver', async () => {
    const todas = palabrasDe('estadios').map((w) => w.texto);
    const { service } = armar(new Map(todas.slice(1).map((t) => [t, 1])));
    expect((await service.palabrasLocal('u1', 'estadios', 1)).palabras[0].texto).toBe(todas[0]);
  });

  it('en mezcla, cada palabra dice su categoría', async () => {
    const { service } = armar();
    const res = await service.palabrasLocal('u1', 'mezcla', 5);
    for (const p of res.palabras) expect(['Jugador', 'Equipo', 'Selección', 'Estadio', 'DT']).toContain(p.categoria);
  });
});

describe('POST /impostor/local: validación y límites', () => {
  const validar = (body: unknown) => authValidationPipe.transform(body, { type: 'body', metatype: PalabrasLocalDto });

  it('acepta temática de la lista y rondas 1/3/5', async () => {
    for (const rondas of [1, 3, 5]) await expect(validar({ tematica: 'mezcla', rondas })).resolves.toMatchObject({ rondas });
    await expect(validar({ tematica: 'dt', rondas: 1, extra: 'x' })).resolves.not.toHaveProperty('extra');
  });

  it('cualquier otra cosa → 400 (nunca llega al servicio)', async () => {
    const malos: unknown[] = [
      null, [], 'mezcla', 3, {},
      { tematica: 'otra', rondas: 3 }, { tematica: 'mezcla', rondas: 2 }, { tematica: 'mezcla', rondas: '3' },
      { tematica: 'mezcla', rondas: null }, { tematica: ['mezcla'], rondas: 3 }, { tematica: { $gt: '' }, rondas: 3 },
      { tematica: 'x'.repeat(50_000), rondas: 3 }, { tematica: 'mezcla', rondas: 1e308 }, { tematica: 'mezcla', rondas: [3] },
    ];
    for (const body of malos) await expect(validar(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pide sesión y tiene límite de 20 por minuto', () => {
    const local = ImpostorController.prototype.local;
    expect(Reflect.getMetadata('__guards__', local)).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', local)).toBe(20);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', local)).toBe(60_000);
    expect((Reflect.getMetadata('__guards__', ImpostorController) as unknown[]).length).toBe(1); // AuthGuard('jwt')
  });
});
