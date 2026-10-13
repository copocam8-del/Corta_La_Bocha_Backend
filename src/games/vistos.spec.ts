import { elegirUnaNoVista, priorizarNoVistos } from './vistos';
import { ContenidoVistoService } from './contenido-visto.service';
import { TriviaService } from '../trivia/trivia.service';
import { AhorcadoService } from '../ahorcado/ahorcado.service';
import { SopaService } from '../sopa/sopa.service';
import { PREGUNTAS } from '../trivia/trivia-bank';
import { BANCO } from '../ahorcado/ahorcado-bank';
import { TEMATICAS_SOPA } from '../sopa/sopa-rules';
import { preguntasDelDia } from '../desafio-diario/desafio-rules';
import { COUNTDOWN_MS, GameEngine, type RoomSnapshot, type RoomStore, type StoredPlayer } from '../rooms/game-engine';
import type { GameId } from './games';

// "Lo visto" en memoria, con la misma lógica que la tabla contenido_visto: por usuario y juego, y al
// leer de varios usuarios, la última vez que lo vio cualquiera. El reloj avanza en cada guardado.
function vistosEnMemoria() {
  const tabla = new Map<string, number>(); // `${user}|${game}|${item}` → cuándo
  let reloj = 0;
  const api = {
    lecturas: 0,
    escrituras: 0,
    leer: jest.fn(async (userIds: string[], game: GameId) => {
      api.lecturas++;
      const out = new Map<string, number>();
      for (const [k, t] of tabla) {
        const [u, g, item] = k.split('|');
        if (g === game && userIds.includes(u)) out.set(item, Math.max(out.get(item) ?? 0, t));
      }
      return out;
    }),
    marcar: jest.fn(async (userIds: string[], game: GameId, items: string[]) => {
      api.escrituras++;
      reloj++;
      for (const u of userIds) for (const i of items) tabla.set(`${u}|${game}|${i}`, reloj);
    }),
  };
  return api;
}

function resultsFalso() {
  let state: unknown = null;
  return {
    closeAbandoned: jest.fn(),
    createMatch: jest.fn(async (_u: string, _g: string, s: unknown) => { state = s; return { id: 'm1' }; }),
    loadActive: jest.fn(async () => ({ state })),
    saveState: jest.fn(),
    finish: jest.fn(async () => ({ newAchievements: [], gameStats: {} })),
    estado: () => state as Record<string, unknown>,
  };
}

describe('reglas: primero lo no visto', () => {
  const lista = ['a', 'b', 'c', 'd', 'e'];
  it('sin nada visto deja la lista igual (mismo resultado que antes)', () => {
    expect(priorizarNoVistos(lista, (x) => x)).toEqual(lista);
    expect(priorizarNoVistos(lista, (x) => x, new Map())).toEqual(lista);
    expect(elegirUnaNoVista(lista, (x) => x, () => 0.5)).toBe('c');
  });

  it('pone primero las no vistas y después las vistas, de la más vieja a la más nueva', () => {
    const vistos = new Map([['a', 5], ['c', 2], ['e', 9]]);
    expect(priorizarNoVistos(lista, (x) => x, vistos)).toEqual(['b', 'd', 'c', 'a', 'e']);
  });

  it('elige una no vista; si ya vio todas, la que vio hace más tiempo', () => {
    expect(elegirUnaNoVista(lista, (x) => x, () => 0, new Map([['a', 1], ['b', 1]]))).toBe('c');
    expect(elegirUnaNoVista(lista, (x) => x, () => 0, new Map([['a', 5], ['b', 3], ['c', 9], ['d', 7], ['e', 8]]))).toBe('b');
  });
});

describe('ContenidoVistoService: una consulta para leer y una para guardar', () => {
  const prisma = { contenido_visto: { groupBy: jest.fn() }, $executeRaw: jest.fn() };
  const service = new ContenidoVistoService(prisma as never);
  beforeEach(() => jest.clearAllMocks());

  it('lee lo visto de todos los jugadores en UNA consulta (la última vez de cualquiera)', async () => {
    prisma.contenido_visto.groupBy.mockResolvedValue([{ item_id: 'mun001', _max: { seen_at: new Date(1000) } }]);
    const v = await service.leer(['u1', 'u2'], 'trivia');
    expect(prisma.contenido_visto.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.contenido_visto.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['item_id'], where: { user_id: { in: ['u1', 'u2'] }, game: 'trivia' },
    }));
    expect(v).toEqual(new Map([['mun001', 1000]]));
  });

  it('guarda todo (todos los jugadores × todos los ítems) en UNA consulta', async () => {
    await service.marcar(['u1', 'u2'], 'sopa_de_letras', ['MESSI', 'PELE', 'MESSI']);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = prisma.$executeRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(sql.strings.join('?')).toContain('ON CONFLICT');
    expect(sql.values).toEqual(expect.arrayContaining([['u1', 'u2'], ['MESSI', 'PELE']]));
  });

  it('si la base falla, el juego sigue (no tira error) y sin nada para leer/guardar no consulta', async () => {
    prisma.contenido_visto.groupBy.mockRejectedValue(new Error('caída'));
    prisma.$executeRaw.mockRejectedValue(new Error('caída'));
    await expect(service.leer(['u1'], 'trivia')).resolves.toEqual(new Map());
    await expect(service.marcar(['u1'], 'trivia', ['x'])).resolves.toBeUndefined();
    jest.clearAllMocks();
    await service.leer([], 'trivia');
    await service.marcar(['u1'], 'trivia', []);
    expect(prisma.contenido_visto.groupBy).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('juegos solos: no repiten hasta agotar y después reinician', () => {
  it('trivia: no repite preguntas (con el mismo filtro) hasta agotarlas; después vuelve a empezar', async () => {
    const vistos = vistosEnMemoria();
    const results = resultsFalso();
    const trivia = new TriviaService(results as never, vistos as never);
    const filtro = { categoria: 'Mundiales' as const };
    const total = PREGUNTAS.filter((p) => p.categoria === 'Mundiales').length;
    const partidas = Math.floor(total / 10);
    const vistas: string[] = [];
    for (let i = 0; i < partidas; i++) {
      await trivia.empezar('u1', filtro);
      vistas.push(...(results.estado().preguntas as { id: string }[]).map((p) => p.id));
    }
    expect(new Set(vistas).size).toBe(vistas.length); // ninguna repetida
    // La siguiente partida usa primero las que faltaban y completa con las más viejas (reinicia)
    await trivia.empezar('u1', filtro);
    const siguiente = (results.estado().preguntas as { id: string }[]).map((p) => p.id);
    const faltaban = PREGUNTAS.filter((p) => p.categoria === 'Mundiales' && !vistas.includes(p.id)).map((p) => p.id);
    expect(siguiente.slice(0, faltaban.length).sort()).toEqual([...faltaban].sort());
    expect(siguiente.slice(faltaban.length).every((id) => vistas.slice(0, 10).includes(id))).toBe(true); // de la primera partida
    expect(vistos.lecturas).toBe(partidas + 1); // una lectura y una escritura por partida
    expect(vistos.escrituras).toBe(partidas + 1);
  });

  it('ahorcado: no repite palabras de esa dificultad hasta agotarlas; después vuelve a empezar', async () => {
    const vistos = vistosEnMemoria();
    const results = resultsFalso();
    const ahorcado = new AhorcadoService(results as never, vistos as never);
    const banco = BANCO.facil.map((p) => p.texto);
    const salieron: string[] = [];
    for (let i = 0; i < banco.length; i++) {
      await ahorcado.empezar('u1', 'facil');
      salieron.push(results.estado().respuesta as string);
    }
    expect(new Set(salieron).size).toBe(banco.length); // todas distintas: salió todo el banco
    await ahorcado.empezar('u1', 'facil');
    expect(results.estado().respuesta).toBe(salieron[0]); // reinicia por la que vio hace más tiempo
  });

  it('sopa: prioriza las palabras de la temática que no vio', async () => {
    const vistos = vistosEnMemoria();
    const results = resultsFalso();
    const sopa = new SopaService(results as never, vistos as never);
    const tema = 'estadios';
    const posibles = TEMATICAS_SOPA[tema].palabras.filter((p) => p.length <= 10).length;
    const palabras = () => (results.estado().sopa as { ubicaciones: { palabra: string }[] }).ubicaciones.map((u) => u.palabra);
    await sopa.empezar('u1', tema, 'facil');
    const primera = palabras();
    await sopa.empezar('u1', tema, 'facil');
    const segunda = palabras();
    const repetidas = segunda.filter((p) => primera.includes(p));
    // Sólo se repite si no alcanzan las que no vio
    expect(repetidas.length).toBeLessThanOrEqual(Math.max(0, primera.length + segunda.length - posibles));
  });
});

describe('multijugador: prioriza lo que no vio NINGUNO de los jugadores', () => {
  function sala(vistos: ReturnType<typeof vistosEnMemoria>) {
    let n = 0;
    const sp = (userId: string): StoredPlayer => ({ userId, username: userId, avatarId: null, roomPlayerId: `rp-${userId}`, joinedAt: new Date(Date.now() + n++) });
    const players: StoredPlayer[] = [];
    const store = {
      createRoom: jest.fn(async (isPrivate: boolean, ids: string[], game?: string) => ({ roomId: 'r1', code: 'C1', isPrivate, status: 'waiting', game: game as never, players: ids.map(sp) })),
      loadRoom: jest.fn(async () => null),
      addPlayer: jest.fn(async (_r: string, u: string) => { const p = sp(u); players.push(p); return p; }),
      removePlayer: jest.fn(async () => undefined),
      setRoomStatus: jest.fn(async () => undefined),
      createMatch: jest.fn(async () => 'm1'),
      createRound: jest.fn(async () => 'r'),
      saveRound: jest.fn(async () => undefined),
      finishMatch: jest.fn(async () => ({})),
    } satisfies RoomStore;
    const last = new Map<string, RoomSnapshot>();
    const engine = new GameEngine(store, { validateAnswers: jest.fn() }, { sendState: (u, s) => last.set(u, s) }, () => {}, vistos as never);
    return { engine, last };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('trivia: ninguna pregunta que ya vio alguno de los dos; se guardan como vistas para los dos', async () => {
    const vistos = vistosEnMemoria();
    // a ya vio casi todas las de Reglamento; b, otras
    const reglamento = PREGUNTAS.filter((p) => p.categoria === 'Reglamento').map((p) => p.id);
    await vistos.marcar(['a'], 'trivia', reglamento.slice(0, reglamento.length - 8));
    await vistos.marcar(['b'], 'trivia', reglamento.slice(reglamento.length - 8, reglamento.length - 5));
    const { engine, last } = sala(vistos);
    const res = await engine.createPrivateRoom('a', { tematica: 'Reglamento', rounds: 5, seconds: 10 }, 'trivia');
    if (!res.ok) throw new Error(res.error);
    for (const u of ['a', 'b']) await engine.join(res.code!, { userId: u });
    vistos.lecturas = vistos.escrituras = 0;
    await engine.start(res.code!, 'a');
    await jest.advanceTimersByTimeAsync(COUNTDOWN_MS);
    expect(vistos.lecturas).toBe(1);
    const noVistasPorNadie = reglamento.slice(reglamento.length - 5);
    // Las 5 preguntas de la partida son justo las que no vio ninguno
    const textos = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const v = last.get('a')!.view as unknown as { pregunta: { texto: string } };
      textos.add(v.pregunta.texto);
      await engine.action(res.code!, 'a', 'answer', { opcion: 0 });
      await engine.action(res.code!, 'b', 'answer', { opcion: 0 });
      await jest.advanceTimersByTimeAsync(5000);
    }
    const ids = PREGUNTAS.filter((p) => textos.has(p.texto)).map((p) => p.id);
    expect(ids.sort()).toEqual([...noVistasPorNadie].sort());
    expect(vistos.escrituras).toBe(1);
    expect(vistos.marcar).toHaveBeenLastCalledWith(['a', 'b'], 'trivia', expect.arrayContaining(noVistasPorNadie));
  });

  it('ahorcado: elige todas las palabras al arrancar, sin repetir y sin las que ya vieron', async () => {
    const vistos = vistosEnMemoria();
    const banco = BANCO.facil.map((p) => p.texto);
    await vistos.marcar(['b'], 'ahorcado', banco.slice(0, banco.length - 3)); // b ya vio casi todas
    const { engine } = sala(vistos);
    const res = await engine.createPrivateRoom('a', { dificultad: 'facil', rounds: 3, seconds: 60 }, 'ahorcado');
    if (!res.ok) throw new Error(res.error);
    for (const u of ['a', 'b']) await engine.join(res.code!, { userId: u });
    await engine.start(res.code!, 'a');
    const elegidas = vistos.marcar.mock.calls.at(-1)![2];
    expect([...elegidas].sort()).toEqual(banco.slice(banco.length - 3).sort());
  });
});

describe('el desafío del día NO cambia (tiene que ser igual para todos)', () => {
  it('da exactamente las mismas preguntas que antes para cada día', () => {
    // Guardadas antes de este cambio (id:índice de la opción correcta)
    const antes: Record<string, string> = {
      '2026-10-12': 'sel008:3,jug019:0,mun054:0,int006:1,mun059:0',
      '2026-10-13': 'mun004:2,reg015:2,mun046:1,int033:1,arg026:3',
      '2026-12-25': 'jug028:3,int011:1,jug020:0,sel020:2,sel007:2',
    };
    for (const [dia, ids] of Object.entries(antes)) {
      expect(preguntasDelDia(dia).map((p) => `${p.id}:${p.correcta}`).join(',')).toBe(ids);
    }
  });
});
