import { Test, TestingModule } from '@nestjs/testing';
import { AchievementsService } from './achievements.service';
import { ACHIEVEMENTS, AchievementContext } from './achievements.definitions';
import { PrismaService } from '../prisma/prisma.service';

const ctx = (over: Partial<AchievementContext> = {}): AchievementContext => ({
  matchesPlayed: 0,
  matchesWon: 0,
  totalPoints: 0,
  currentStreak: 0,
  mode: 'vs_ai',
  won: false,
  ...over,
});

const ganados = (c: AchievementContext) => ACHIEVEMENTS.filter((a) => a.isUnlocked(c)).map((a) => a.id);

describe('definición de logros', () => {
  it('hay entre 8 y 12 logros, con ids únicos y textos en español', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(8);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(12);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.id.length).toBeLessThanOrEqual(40); // largo de la columna en la base
      expect(a.description).toMatch(/\.$/);
    }
  });

  it('primera partida perdida → sólo Debut', () => {
    expect(ganados(ctx({ matchesPlayed: 1 }))).toEqual(['debut']);
  });

  it('primera victoria → Debut y Primer gol', () => {
    expect(ganados(ctx({ matchesPlayed: 1, matchesWon: 1, won: true, currentStreak: 1 }))).toEqual(['debut', 'primer_gol']);
  });

  it('rachas: 3 seguidas da Hat-trick, 5 da también Imparable', () => {
    expect(ganados(ctx({ matchesPlayed: 3, matchesWon: 3, currentStreak: 3 }))).toContain('hat_trick');
    expect(ganados(ctx({ matchesPlayed: 3, matchesWon: 3, currentStreak: 3 }))).not.toContain('imparable');
    expect(ganados(ctx({ matchesPlayed: 5, matchesWon: 5, currentStreak: 5 }))).toEqual(
      expect.arrayContaining(['hat_trick', 'imparable']),
    );
  });

  it('cantidades: 10 y 50 partidas, 10 victorias, 100 y 1000 puntos', () => {
    const c = ctx({ matchesPlayed: 50, matchesWon: 10, totalPoints: 1000 });
    expect(ganados(c)).toEqual(expect.arrayContaining(['titular', 'idolo', 'goleador', 'centenario', 'botin_de_oro']));
  });

  it('Pleno sólo contra la máquina y con todas válidas', () => {
    expect(ganados(ctx({ matchesPlayed: 1, allAnswersValid: true }))).toContain('pleno');
    expect(ganados(ctx({ matchesPlayed: 1, allAnswersValid: false }))).not.toContain('pleno');
    expect(ganados(ctx({ matchesPlayed: 1, mode: 'multiplayer', allAnswersValid: true }))).not.toContain('pleno');
  });

  it('Le ganaste a la máquina sólo en Experto', () => {
    expect(ganados(ctx({ won: true, aiDifficulty: 'experto' }))).toContain('le_ganaste_a_la_maquina');
    expect(ganados(ctx({ won: true, aiDifficulty: 'dificil' }))).not.toContain('le_ganaste_a_la_maquina');
  });

  it('Campeón del barrio sólo ganando en multijugador', () => {
    expect(ganados(ctx({ mode: 'multiplayer', won: true }))).toContain('campeon_del_barrio');
    expect(ganados(ctx({ mode: 'vs_ai', won: true }))).not.toContain('campeon_del_barrio');
  });
});

describe('AchievementsService', () => {
  let service: AchievementsService;
  const tx = { user_achievements: { findMany: jest.fn(), createMany: jest.fn() } };
  const prisma = { user_achievements: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AchievementsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AchievementsService);
  });

  it('guarda y devuelve sólo los logros nuevos', async () => {
    tx.user_achievements.findMany.mockResolvedValue([{ achievement_id: 'debut' }]);

    const nuevos = await service.unlockFor('u1', ctx({ matchesPlayed: 1, matchesWon: 1, won: true }), tx as never);

    expect(nuevos.map((a) => a.id)).toEqual(['primer_gol']);
    expect(tx.user_achievements.createMany).toHaveBeenCalledWith({
      data: [{ user_id: 'u1', achievement_id: 'primer_gol' }],
      skipDuplicates: true,
    });
  });

  it('si no hay nada nuevo, no escribe', async () => {
    tx.user_achievements.findMany.mockResolvedValue([{ achievement_id: 'debut' }]);
    await expect(service.unlockFor('u1', ctx({ matchesPlayed: 2 }), tx as never)).resolves.toEqual([]);
    expect(tx.user_achievements.createMany).not.toHaveBeenCalled();
  });

  it('lista todos los logros marcando los desbloqueados', async () => {
    const fecha = new Date('2026-10-08T12:00:00Z');
    prisma.user_achievements.findMany.mockResolvedValue([{ achievement_id: 'debut', unlocked_at: fecha }]);

    const lista = await service.listForUser('u1');

    expect(lista).toHaveLength(ACHIEVEMENTS.length);
    expect(lista.find((a) => a.id === 'debut')).toMatchObject({ unlocked: true, unlockedAt: fecha });
    expect(lista.filter((a) => a.unlocked)).toHaveLength(1);
  });
});
