import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MultiplayerService } from '../rooms/multiplayer.service';
import { TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';
import { PREGUNTAS } from '../trivia/trivia-bank';
import { TEMATICAS_SOPA, type TematicaSopa } from '../sopa/sopa-rules';
import { TEMAS_MEMOTEST, type TemaMemotest } from '../memotest/memotest-rules';
import {
  COSTO_IA_POR_PARTIDA, desdeDe, inicioDelDiaAR, MIN_VECES, n, palabrasDificiles, porcentaje, porDiaYJuego, rankingPreguntas,
  rellenarDias, resumenPartidas, type PeriodoAdmin,
} from './admin-calculos';

// Panel de administración: SÓLO LECTURA. Todo se calcula en la base con pocas consultas (una por
// dato, agrupadas en SQL). Nunca devuelve contraseñas, hashes, tokens, fechas de nacimiento ni ids
// de Google. El email sale sólo en la lista de últimos registros.
//
// Las fechas son TIMESTAMP sin zona horaria en UTC: el "desde" va como texto UTC (::timestamp) y
// los días se agrupan en hora argentina (− 3 h).

const AR = Prisma.sql`interval '3 hours'`;
const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;
const textoPregunta = new Map(PREGUNTAS.map((p) => [p.id, p.texto]));

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly multiplayer: MultiplayerService,
    private readonly config: ConfigService,
    private readonly validator: TuttiFruttiValidatorService,
  ) {}

  private q<T>(sql: Prisma.Sql) {
    return this.prisma.$queryRaw<T[]>(sql);
  }

  // ── 1. Usuarios ─────────────────────────────────────────────────────────────────────────────
  async usuarios(periodo: PeriodoAdmin, now = new Date()) {
    const desde = desdeDe(periodo, now);
    const hoy = inicioDelDiaAR(now);
    const [[totales], porDia, [activos], ultimos] = await Promise.all([
      this.q<Record<string, bigint>>(Prisma.sql`/* admin:usuarios */
        SELECT count(*) AS total,
               count(*) FILTER (WHERE created_at >= ${ts(desde)}) AS nuevos,
               count(*) FILTER (WHERE created_at >= ${ts(desde)} AND google_id IS NOT NULL) AS con_google,
               count(*) FILTER (WHERE created_at >= ${ts(desde)} AND google_id IS NULL AND password_hash IS NOT NULL) AS con_contrasena
        FROM users`),
      this.q<{ dia: string; cantidad: bigint }>(Prisma.sql`/* admin:usuarios-por-dia */
        SELECT to_char(created_at - ${AR}, 'YYYY-MM-DD') AS dia, count(*) AS cantidad
        FROM users WHERE created_at >= ${ts(desde)} GROUP BY 1 ORDER BY 1`),
      // "Jugaron" = empezaron una partida solo o tienen una partida que contó (multijugador incluido)
      this.q<Record<string, bigint>>(Prisma.sql`/* admin:activos */
        SELECT count(DISTINCT u) FILTER (WHERE t >= ${ts(hoy)}) AS hoy,
               count(DISTINCT u) FILTER (WHERE t >= ${ts(desdeDe('7d', now))}) AS semana,
               count(DISTINCT u) AS mes
        FROM (
          SELECT user_id AS u, created_at AS t FROM matches WHERE user_id IS NOT NULL AND created_at >= ${ts(desdeDe('30d', now))}
          UNION ALL
          SELECT user_id, created_at FROM match_results WHERE created_at >= ${ts(desdeDe('30d', now))}
        ) x`),
      this.prisma.users.findMany({
        orderBy: { created_at: 'desc' },
        take: 20,
        select: { username: true, email: true, created_at: true, google_id: true },
      }),
    ]);
    return {
      periodo,
      total: n(totales?.total),
      nuevos: n(totales?.nuevos),
      conGoogle: n(totales?.con_google),
      conContrasena: n(totales?.con_contrasena),
      nuevosPorDia: rellenarDias(porDia.map((f) => ({ dia: f.dia, cantidad: n(f.cantidad) })), desde, now),
      activos: { hoy: n(activos?.hoy), semana: n(activos?.semana), mes: n(activos?.mes) },
      // El id de Google no sale: sólo si entró con Google
      ultimosRegistros: ultimos.map((u) => ({ username: u.username, email: u.email, creado: u.created_at, conGoogle: !!u.google_id })),
    };
  }

  // ── 2. Partidas ─────────────────────────────────────────────────────────────────────────────
  async partidas(periodo: PeriodoAdmin, now = new Date()) {
    const desde = desdeDe(periodo, now);
    const [porTipo, porDia, [abandonosMulti], top] = await Promise.all([
      this.q<{ game: string; mode: string; status: string; cantidad: bigint }>(Prisma.sql`/* admin:partidas */
        SELECT game, mode, status, count(*) AS cantidad FROM matches
        WHERE created_at >= ${ts(desde)} GROUP BY 1, 2, 3`),
      this.q<{ dia: string; game: string; cantidad: bigint }>(Prisma.sql`/* admin:partidas-por-dia */
        SELECT to_char(created_at - ${AR}, 'YYYY-MM-DD') AS dia, game, count(*) AS cantidad FROM matches
        WHERE created_at >= ${ts(desde)} GROUP BY 1, 2 ORDER BY 1`),
      this.q<{ cantidad: bigint }>(Prisma.sql`/* admin:abandonos-multi */
        SELECT count(*) AS cantidad FROM match_results
        WHERE mode = 'multiplayer' AND abandoned AND created_at >= ${ts(desde)}`),
      this.q<{ username: string; puntos: bigint; partidas: bigint; ganadas: bigint }>(Prisma.sql`/* admin:top */
        SELECT u.username, sum(mr.points) AS puntos, count(*) AS partidas, count(*) FILTER (WHERE mr.won) AS ganadas
        FROM match_results mr JOIN users u ON u.id = mr.user_id
        WHERE mr.created_at >= ${ts(desde)}
        GROUP BY u.id, u.username ORDER BY puntos DESC, partidas DESC LIMIT 10`),
    ]);
    const resumen = resumenPartidas(porTipo.map((f) => ({ ...f, cantidad: n(f.cantidad) })));
    return {
      periodo,
      ...resumen,
      abandonosMultijugador: n(abandonosMulti?.cantidad), // jugadores que se fueron de una partida multijugador
      porDia: porDiaYJuego(porDia.map((f) => ({ ...f, cantidad: n(f.cantidad) })), desde, now),
      enVivo: { ...this.multiplayer.engine.liveSummary(), enCola: this.multiplayer.queue.waiting },
      top: top.map((t) => ({ username: t.username, puntos: n(t.puntos), partidas: n(t.partidas), ganadas: n(t.ganadas) })),
    };
  }

  // ── 3. IA ───────────────────────────────────────────────────────────────────────────────────
  async ia(periodo: PeriodoAdmin, now = new Date()) {
    const desde = desdeDe(periodo, now);
    const [[partidas], [respuestas]] = await Promise.all([
      // Una partida de Tutti Frutti queda "sin validar" si alguna respuesta quedó sin validar
      this.q<Record<string, bigint>>(Prisma.sql`/* admin:ia-partidas */
        SELECT count(*) FILTER (WHERE NOT sin_validar) AS validadas, count(*) FILTER (WHERE sin_validar) AS sin_validar
        FROM (
          SELECT m.id, bool_or(a.validated_by = 'unverified') AS sin_validar
          FROM matches m JOIN rounds r ON r.match_id = m.id JOIN answers a ON a.round_id = r.id
          WHERE m.game = 'tutti_frutti' AND m.status = 'finished' AND m.created_at >= ${ts(desde)}
          GROUP BY m.id
        ) t`),
      // Respuestas escritas (no vacías) que la IA evaluó
      this.q<Record<string, bigint>>(Prisma.sql`/* admin:ia-respuestas */
        SELECT count(*) FILTER (WHERE a.is_valid) AS validas, count(*) AS evaluadas
        FROM answers a JOIN rounds r ON r.id = a.round_id JOIN matches m ON m.id = r.match_id
        WHERE m.created_at >= ${ts(desde)} AND a.is_valid IS NOT NULL AND coalesce(btrim(a.answer_text), '') <> ''`),
    ]);
    const validadas = n(partidas?.validadas);
    const sinValidar = n(partidas?.sin_validar);
    return {
      periodo,
      // Sólo el nombre del proveedor y el modelo: NUNCA la clave. Si falta la clave, el proveedor
      // queda "sin configurar" (todo sale "sin validar").
      proveedor: (this.config.get<string>('AI_PROVIDER') || 'gemini').toLowerCase(),
      modelo: this.validator.providerInfo?.model ?? null,
      configurado: !!this.validator.providerInfo,
      partidasValidadas: validadas,
      partidasSinValidar: sinValidar,
      porcentajeSinValidar: porcentaje(sinValidar, validadas + sinValidar),
      respuestasEvaluadas: n(respuestas?.evaluadas),
      porcentajeValidas: porcentaje(n(respuestas?.validas), n(respuestas?.evaluadas)),
      gastoEstimadoUsd: Math.round(validadas * COSTO_IA_POR_PARTIDA * 100) / 100,
      notaGasto: `Estimado: US$ ${COSTO_IA_POR_PARTIDA.toFixed(2).replace('.', ',')} por partida validada. El gasto real está en la consola del proveedor.`,
    };
  }

  // ── 4. Contenido ────────────────────────────────────────────────────────────────────────────
  async contenido(periodo: PeriodoAdmin, now = new Date()) {
    const desde = desdeDe(periodo, now);
    const [preguntas, palabras, temas, letras] = await Promise.all([
      // Trivia sola y desafío del día: cada respuesta guardada en matches.state con su pregunta
      // (misma posición). La trivia multijugador no guarda las preguntas en la base.
      this.q<{ id: string; veces: bigint; aciertos: bigint }>(Prisma.sql`/* admin:trivia */
        SELECT p.value->>'id' AS id, count(*) AS veces,
               count(*) FILTER (WHERE (r.value->>'correcta') = 'true' OR (r.value->>'marca') = 'V') AS aciertos
        FROM matches m
        CROSS JOIN LATERAL jsonb_array_elements(m.state->'respuestas') WITH ORDINALITY AS r(value, i)
        JOIN LATERAL jsonb_array_elements(m.state->'preguntas') WITH ORDINALITY AS p(value, j) ON p.j = r.i
        WHERE m.game IN ('trivia', 'trivia_diaria') AND m.created_at >= ${ts(desde)}
          AND jsonb_typeof(m.state->'respuestas') = 'array' AND jsonb_typeof(m.state->'preguntas') = 'array'
        GROUP BY 1`),
      // Ahorcado solo (el multijugador no guarda la palabra): terminadas o abandonadas
      this.q<{ palabra: string; jugadas: bigint; derrotas: bigint }>(Prisma.sql`/* admin:ahorcado */
        SELECT m.state->>'respuesta' AS palabra, count(*) AS jugadas,
               count(*) FILTER (WHERE m.status = 'abandoned' OR mr.won IS NOT TRUE) AS derrotas
        FROM matches m LEFT JOIN match_results mr ON mr.match_id = m.id
        WHERE m.game = 'ahorcado' AND m.status IN ('finished', 'abandoned') AND m.created_at >= ${ts(desde)}
          AND m.state->>'respuesta' IS NOT NULL
        GROUP BY 1`),
      // Temática de la sopa / tema del memotest: columna tematica (multijugador) o el estado (solo)
      this.q<{ game: string; tema: string; cantidad: bigint }>(Prisma.sql`/* admin:temas */
        SELECT game, coalesce(tematica, state->>'tematica', state->>'tema') AS tema, count(*) AS cantidad
        FROM matches WHERE game IN ('sopa_de_letras', 'memotest') AND created_at >= ${ts(desde)}
        GROUP BY 1, 2 ORDER BY 3 DESC`),
      this.q<{ letra: string; cantidad: bigint }>(Prisma.sql`/* admin:letras */
        SELECT r.letter AS letra, count(*) AS cantidad
        FROM rounds r JOIN matches m ON m.id = r.match_id
        WHERE m.game = 'tutti_frutti' AND r.started_at >= ${ts(desde)}
        GROUP BY 1 ORDER BY 2 DESC, 1`),
    ]);
    const nombreTema = (game: string, tema: string) =>
      game === 'sopa_de_letras'
        ? (TEMATICAS_SOPA[tema as TematicaSopa]?.nombre ?? tema)
        : (TEMAS_MEMOTEST[tema as TemaMemotest]?.nombre ?? tema);
    const temasDe = (game: string) =>
      temas
        .filter((t) => t.game === game && t.tema)
        .map((t) => ({ id: t.tema, nombre: nombreTema(game, t.tema), cantidad: n(t.cantidad) }));
    return {
      periodo,
      minimoVeces: MIN_VECES,
      trivia: rankingPreguntas(
        preguntas.map((p) => ({ id: p.id, veces: n(p.veces), aciertos: n(p.aciertos) })),
        (id) => textoPregunta.get(id),
      ),
      ahorcado: palabrasDificiles(palabras.map((p) => ({ palabra: p.palabra, jugadas: n(p.jugadas), derrotas: n(p.derrotas) }))),
      sopa: temasDe('sopa_de_letras'),
      memotest: temasDe('memotest'),
      letras: letras.map((l) => ({ letra: l.letra, cantidad: n(l.cantidad) })),
      // Lo que la base no guarda (para no inventarlo)
      sinDatos: [
        'Trivia multijugador: las preguntas y respuestas de cada jugador no se guardan (sólo cuentan la trivia sola y el desafío del día).',
        'Ahorcado multijugador: la palabra de cada ronda no se guarda (sólo cuenta el ahorcado solo).',
      ],
    };
  }
}
