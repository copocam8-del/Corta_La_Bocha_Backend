import { argentinaDay, periodStart } from './periods';

describe('períodos de las ligas (hora argentina)', () => {
  it('la semana empieza el lunes 00:00 de Argentina (03:00 UTC)', () => {
    // Miércoles 14/10/2026 15:00 UTC → lunes 12/10 00:00 AR = 03:00 UTC
    expect(periodStart('semanal', new Date('2026-10-14T15:00:00Z'))!.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    // Lunes 12/10 02:00 UTC = domingo 11/10 23:00 en Argentina → todavía es la semana anterior
    expect(periodStart('semanal', new Date('2026-10-12T02:00:00Z'))!.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    // Domingo a la noche sigue siendo la misma semana
    expect(periodStart('semanal', new Date('2026-10-19T02:59:00Z'))!.toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });

  it('el mes empieza el día 1 a las 00:00 de Argentina', () => {
    expect(periodStart('mensual', new Date('2026-10-14T15:00:00Z'))!.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    // 1/11 01:00 UTC = 31/10 22:00 en Argentina → todavía octubre
    expect(periodStart('mensual', new Date('2026-11-01T01:00:00Z'))!.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  it('global y ELO no tienen período', () => {
    expect(periodStart('global')).toBeNull();
    expect(periodStart('elo')).toBeNull();
  });

  it('día argentino (cambia a medianoche de Argentina)', () => {
    expect(argentinaDay(new Date('2026-10-13T02:59:00Z'))).toBe('2026-10-12');
    expect(argentinaDay(new Date('2026-10-13T03:00:00Z'))).toBe('2026-10-13');
  });
});
