# CLAUDE.md — Corta La Bocha (backend)

"Corta La Bocha" es un Tutti Frutti (Stop) de fútbol: se sortea una letra y los jugadores completan
categorías futboleras (Jugador, Equipo, DT, Estadio…). Equipo: Camila Copo, Augusto Trento y Nicolás Borda.
El frontend vive en `../Corta_La_Bocha_Frontend` (React 19 + Vite).

Hablá en español rioplatense y explicá simple: el equipo está aprendiendo.

## Stack real (lo que está en el código)

- **NestJS 11** + TypeScript, **Prisma 5** + **PostgreSQL**
- Auth con **JWT** (`@nestjs/jwt` + `passport-jwt`), contraseñas con **bcrypt**
- Tiempo real con **Socket.IO** (`src/rooms/rooms.gateway.ts`)
- Validación de respuestas con IA en `src/tutti-frutti/`: Gemini (por defecto), Claude u OpenAI según `AI_PROVIDER`.
  Sin IA las respuestas quedan
  "sin validar" (0 puntos): nunca se aceptan por defecto
- Deploy en **Render** (`https://corta-la-bocha-backend.onrender.com`)

> Ojo: varios archivos de `docs/` (`STACK.md`, `API_GUIDELINES.md`, partes de `ARCHITECTURE.md`) y las
> carpetas `backend/` (Django) y `database/` son de una plantilla inicial y hablan de Django, Python o Next.js.
> **No reflejan el código actual.** Ante una duda, manda el código. Sí siguen vigentes las reglas de
> `docs/RULES.md` (el backend es la fuente de verdad: puntajes, validaciones y estado del juego se deciden acá)
> y la descripción del juego en `docs/PROJECT_CONTEXT.md`.

## Comandos

```bash
npm ci                      # instalar dependencias
npm run start:dev           # servidor con recarga (puerto PORT o 3000)
npm run build               # compila a dist/ (el entrypoint queda en dist/src/main.js)
npx jest                    # tests unitarios (*.spec.ts dentro de src/)
npx jest src/auth           # sólo los de auth
npx prisma migrate dev      # crear/aplicar migraciones en la base local
npx prisma migrate deploy   # aplicar migraciones existentes (sin crear nuevas)
npx prisma db seed          # cargar categorías (prisma/seed.ts)
```

Todos los `*.spec.ts` pasan (`npx jest`). La IA siempre va mockeada en los tests.

Tests e2e de seguridad (app completa + PostgreSQL **local**): con `npm run db:local` andando, en otra terminal
`npx jest --config test/jest-e2e.json test/seguridad --forceExit`. `test/e2e-env.ts` se carga antes de cada e2e:
fija una `DATABASE_URL` local (`E2E_DATABASE_URL`, o la de `.env.local`, o la local por defecto), **se niega a
seguir si no es localhost** y apaga IA real, mails, Google y captcha (nada sale a internet). Los e2e viejos de la
plantilla (`app.e2e-spec.ts`, `tutti-frutti.e2e-spec.ts`) están desactualizados: el CI corre sólo `test/seguridad`.

### Base local para programar

`npm run db:local` (PostgreSQL local con Docker o embedded-postgres + migraciones + seed; `-- --verificar` levanta,
migra y apaga) y `npm run dev:local` (servidor con `.env.local`). Ambos **se niegan a arrancar si `DATABASE_URL` de
`.env.local` no es localhost**. Paso a paso para Windows en el README. Scripts en `scripts/*.mjs`; datos en `.local-db/`
(ignorado por git). La base se crea en **UTF8** (como Supabase); si tu `.local-db/data` es de antes del 14/10/2026
quedó en WIN1252 (la trivia da 500 por la "ć" de Modrić): borrá esa carpeta y corré `npm run db:local` de nuevo.

### Probar con un servidor real (sin tocar producción)

El `.env` apunta a la base de **producción**: nunca levantes el server ni corras Prisma con ese `.env` solo.
Usá una base PostgreSQL local y pasá las variables explícitas (en PowerShell, `$env:X = ''` **borra** la
variable y entonces se usa la del `.env`: poné siempre un valor).

```powershell
$env:DATABASE_URL = 'postgresql://usuario@localhost:5432/clb_test'   # base LOCAL
$env:NODE_ENV = 'development'; $env:JWT_SECRET = 'local'; $env:PORT = '3100'
$env:CORS_ORIGIN = 'http://localhost:5173'
$env:AI_PROVIDER = 'fake'          # valida con un banco fijo: no gasta cuota de la IA
npx prisma migrate deploy; npx prisma db seed; npm run build; node dist/src/main.js
```

## Estructura

```
src/
  main.ts              arranque: PORT (Render)
  app.setup.ts         trust proxy, cabeceras de seguridad (helmet) y CORS_ORIGIN; lo usan main.ts y los tests
  security/            cabeceras HTTP de seguridad (security-headers.ts)
  app.module.ts        ConfigModule global + módulos
  auth/                registro, login, JWT
    jwt.config.ts      ÚNICO lugar que lee JWT_SECRET / JWT_EXPIRATION
    auth-validation.pipe.ts  ValidationPipe sólo de /auth, errores agrupados por campo
    dto/auth-rules.ts  reglas de registro (largos, regex, edad mínima, contraseñas comunes, mails descartables)
    dto/common-passwords.ts / dto/disposable-domains.ts   listas propias (sin dependencias)
    email-attempt-limiter.ts  límite de intentos por email (login y forgot-password)
    turnstile.service.ts      captcha de Cloudflare en el registro (opcional)
  users/               perfil (/users/me)
  admin/               panel de administración del equipo (sólo lectura, ADMIN_EMAILS)
  rooms/               salas multijugador + gateway Socket.IO (motor común en game-engine.ts)
    modes/             un "modo" por juego: tutti-frutti, ahorcado, trivia, sopa, memotest (index.ts = registro)
  solo-matches/        partidas contra la IA
  tutti-frutti/        validación de respuestas (reglas en código + IA) y puntaje (scoring.ts)
  categories/          listado de categorías
  prisma/              PrismaModule (global) + PrismaService: una sola conexión para toda la app
prisma/
  schema.prisma        modelos (users, profiles, rooms, matches, rounds, answers, votes, categories, seasons)
  migrations/          migraciones (nunca editar una ya aplicada)
  seed.ts              categorías; los nombres deben coincidir con CATEGORY_RULES de tutti-frutti.service.ts
```

## Auth: cómo funciona

- `POST /auth/register` → 201 `{ message, userId, username }`
- `POST /auth/login` → 201 `{ access_token, username, name }`
- `GET /auth/me` (Bearer token) → `{ userId, email }`
- Errores: 400 `{ statusCode, message: 'Datos inválidos', errors: { campo: ['mensaje'] } }`,
  401 credenciales inválidas, 409 email o usuario repetido.
- Límite de intentos por IP (`@nestjs/throttler`, en memoria): login 10/min, registro 5/min → 429.
  `app.setup.ts` tiene `trust proxy` para que Render pase la IP real.
- Además, **por email** (`EmailAttemptLimiter`, en memoria): 5 logins fallidos cada 15 min (uno correcto limpia
  el contador) y 5 pedidos de `forgot-password` cada 15 min → 429. Cuenta igual exista o no la cuenta.
- Registro: rechaza contraseñas de la lista de las más comunes (sin mayúsculas, también en `reset-password`; el
  login no, por las cuentas viejas) y mails de dominios descartables (también subdominios). Con
  `TURNSTILE_SECRET_KEY` exige `captchaToken` (ver "Seguridad").
- En registro, usuario/nombre/apellido/país vacíos ("") cuentan como "no enviados". Si no viene usuario se
  genera uno desde el nombre. El usuario se compara sin distinguir mayúsculas ("Messi" = "messi").
- Privacidad: `GET /users` y `GET /users/:id` devuelven sólo datos públicos (sin email, fecha de nacimiento
  ni nombre real). Los datos completos salen sólo en `/users/me`.
- Reglas: contraseña de 8 a 72 caracteres, usuario de 3 a 30 (letras, números y `_`), fecha de nacimiento
  obligatoria y edad mínima de 13 años. El email se guarda en minúsculas y se busca sin distinguir mayúsculas.
- El frontend repite estas reglas en `src/auth/rules.ts`: **si cambiás una, cambiala en los dos repos.**
- No hay `ValidationPipe` global: sólo `/auth` valida los DTO (decisión a propósito, para no romper
  los otros módulos). En los DTO de auth, los decoradores se evalúan de abajo hacia arriba y se muestra
  sólo el primer error, así que la regla más básica (vacío / tipo) va pegada a la propiedad.

## Perfil, estadísticas y ranking

- `src/stats/stats.service.ts` es el **único** lugar que modifica partidas jugadas/ganadas, puntos y rachas
  (`recordMatchResult`). También calcula el ranking (`getUserRanking`, `getTopPlayers`).
- Partida solo (la que usa el frontend): `POST /solo-matches/quick` (el servidor sortea letra y arma el plan de la
  máquina) y `POST /solo-matches/quick/:matchId/finish` (valida respuestas, decide el resultado y suma
  estadísticas una sola vez). Las reglas están en `src/solo-matches/solo-quick.ts`:
  - **Letras por temática** (`letrasDe`): sólo se sortean letras donde, como mucho, UNA categoría no tiene
    ninguna respuesta real posible según el banco (ej. en "Mundial" no sale la L: no hay país sede ni
    selección campeona con L). Si completás el banco, una letra puede pasar a sortearse.
  - **¡Basta!** sólo con todas las categorías completas: si `finish` llega antes de tiempo con alguna vacía → 400
    y la partida sigue.
  - **Tiempo**: `rounds.started_at` lo pone el servidor (`new Date()`), no el `now()` de la base (la columna no
    tiene zona horaria). La máquina sólo cuenta lo que escribió hasta el `finish` (con tope en la duración).
  - **Tarde / abandono**: si `finish` llega más de `GRACIA_MS` (60 s) después del final → 410 y cuenta como
    perdida. Al empezar otra partida, las que quedaron "en juego" vencidas se cierran como `abandoned` y cuentan
    como perdidas (cortan la racha); si tienen más de 24 h, se cierran sin tocar estadísticas.
  - La API vieja por rondas (`POST /solo-matches`, `.../answers`, `.../validate`) se borró: no controlaba de quién
    era la partida y dejaba llamar a la IA sin límite.
- Multijugador en tiempo real de todos los juegos (`src/rooms/`), ver la sección "Multijugador" más abajo.
- **ELO** (`src/stats/elo.ts`): arranca en 1000, K = 32. Contra la máquina, ELO fijo por dificultad (fácil 800,
  medio 1000, difícil 1200, experto 1400); abandonar = derrota. Multijugador: cada uno contra cada uno (gana el que
  hizo más puntos), dividido por la cantidad de rivales; el que abandona pierde contra todos. Las partidas "sin
  validar" no cuentan. Se guarda en `profiles.elo` / `elo_games`.
- **Ligas**: cada partida que cuenta guarda una fila por jugador en `match_results` (puntos, ganó, abandonó, ELO
  antes/después, `game`). `GET /users/ranking?period=global|semanal|mensual|elo` y `GET /users/me/ranking?period=…`
  (posición aunque no estés en el top; `position: null` si no jugaste en el período). Semana desde el lunes 00:00 y mes
  desde el día 1 00:00, **hora argentina** (`src/stats/periods.ts`). Las ligas empiezan a contar desde que se aplica la
  migración `20261012120000_ligas_elo` (no hay datos viejos en `match_results`).
- Ojo con las fechas: las columnas son `TIMESTAMP` sin zona horaria; las que importan (`started_at`, `match_results.created_at`)
  las pone el servidor con `new Date()`, no el `now()` de la base.
- Perfil: `PUT /users/me` también cambia `first_name` y `last_name` (mismas reglas que el registro: texto, hasta
  `NAME_MAX` = 50; "", sólo espacios o null se ignoran: el nombre nunca se borra). Se devuelven sólo en `/users/me`; los
  datos públicos (`GET /users`, `/users/:id`, ranking, salas) siguen sin el nombre real.
- Perfil: `PUT /users/me` valida con el pipe de auth. El avatar se elige de `src/users/avatars.ts`
  (mismo set en el frontend): `BASE_AVATAR_IDS` (íconos clásicos) + `CLUB_AVATAR_IDS` (hinchas de clubes, `hincha_…`, uno por camiseta: los clubes con la misma camiseta lo comparten,
  en orden alfabético) + `CLUB_AVATAR_IDS_2` (segunda pose de cada hincha: mismo id + `_2`). Sólo se aceptan esos ids (400 si no). El id entra en `profiles.avatar_id` (VARCHAR 30): máximo 30
  caracteres. **Si agregás uno, agregalo en los dos repos** (`avatars.spec.ts` compara con el frontend si está al lado). `GET /users/me/ranking` y `GET /users/ranking` (top 50, datos públicos).

## Validación de respuestas y puntaje

1. **En código, antes de la IA** (`src/tutti-frutti/answer-rules.ts`): que no esté vacía, que tenga al menos 2 letras
   y que empiece con la letra. Se ignoran tildes, mayúsculas y signos. Con artículo ("La Bombonera") vale la letra
   del artículo o la de la palabra siguiente. "Estadio", "Clásico", "Derbi" y "de" **nunca** cuentan en sus categorías.
2. **Proveedor de IA** (`src/tutti-frutti/ai-providers.ts`), según `AI_PROVIDER`:

   | `AI_PROVIDER` | Clave | Modelo por defecto | Salida estructurada | Cliente |
   |---|---|---|---|---|
   | `gemini` (por defecto) | `GEMINI_API_KEY` | `gemini-3.8-flash` | `responseMimeType: application/json` + `responseJsonSchema` | SDK `@google/genai` |
   | `anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-5-5` | `output_config.format` (`json_schema`), `effort: low` | SDK `@anthropic-ai/sdk` |
   | `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` | `response_format` `json_schema` `strict` | `fetch` |

   `AI_MODEL` cambia el modelo. Si falta la clave o `AI_PROVIDER` es inválido, el server arranca igual, lo avisa en el
   log y todo queda "sin validar". Los tres reciben lo mismo (instrucciones, respuestas como JSON, schema) y devuelven
   el mismo JSON; para agregar otro, implementá `AiProvider` y sumalo a `createAiProvider`.
3. **Con IA, una sola llamada por ronda** (`TuttiFruttiValidatorService.validateAnswers`): todas las respuestas
   (de todos los jugadores, incluida la máquina) van juntas, **como datos JSON** en el mensaje del usuario; el prompt
   de sistema dice que nunca se obedezcan instrucciones escritas en una respuesta. Devuelve por cada una `isValid`,
   `canonical` (nombre "oficial", ej. "mesi" → "Lionel Messi") y `reason` en español.
   - El schema tiene `additionalProperties: false` en **todos** los objetos (OpenAI y Claude lo exigen en modo estricto).
   - Caché en memoria por (categoría, letra, respuesta normalizada), hasta 5000 entradas.
   - Si la IA falla, reintenta una vez (el SDK de Anthropic va con `maxRetries: 0` para no reintentar dos veces). Si vuelve a fallar → `status: 'unverified'`, 0 puntos. Una partida solo con
     respuestas sin validar se termina pero **no cuenta** para estadísticas, ranking ni logros.
   - **Cuota agotada (429)**: no se reintenta (sería otro pedido perdido) y la IA queda en pausa lo que pida el
     proveedor (`retryDelay`, tope 1 h); mientras tanto todo queda "sin validar" al instante.
     **El plan gratis de Gemini da 20 pedidos por día** para `gemini-3.8-flash` (una partida = un pedido).
   - **Modo de prueba `AI_PROVIDER=fake`** (`fake-ai-provider.ts`): valida con el banco de la máquina +
     `FAKE_EXTRA_ANSWERS`, sin red ni clave. **En producción se rechaza** (queda todo "sin validar").
     `AI_FAKE_DELAY_MS` simula la demora (default 300).
   - Tiempos: cada intento se corta a los 12 s y la validación entera nunca pasa de 25 s (`AI_ATTEMPT_TIMEOUT_MS`,
     `AI_TOTAL_BUDGET_MS`). El frontend espera 45 s (`FINISH_TIMEOUT_MS` en `src/api/soloMatch.ts`): si cambiás uno,
     revisá el otro.
   - Razonamiento al mínimo: Gemini 3 con `thinkingLevel: LOW` (gemini-3.8-flash **rechaza** `MINIMAL`; si el modelo
     rechaza el nivel, se reintenta sin `thinkingConfig`), Claude Haiku con `thinking: disabled`, OpenAI con
     `reasoning_effort: minimal` sólo en modelos o*/gpt-5.
   - Para medir cuánto tarda una ronda real: `npx ts-node -T scripts/medir-validacion.ts` (usa la IA del `.env`,
     gasta créditos, no toca la base).
4. **Puntaje** (`src/tutti-frutti/scoring.ts`, lo usan la partida solo y el multijugador): por categoría, 20 si es el
   único con respuesta válida, 10 si es válida y nadie puso la misma (se compara el nombre canónico), 5 si otro puso
   la misma, 0 si no vale. En la partida solo, la máquina es un jugador más.
5. **Máquina rival**: responde desde `src/solo-matches/ai-answer-bank.ts` (por categoría y letra, sólo nombres reales;
   celdas vacías si no hay ninguno conocido). La dificultad cambia cuántas sabe y qué tan rápido escribe
   (`DIFICULTADES` en `solo-quick.ts`). Sus respuestas pasan por la misma validación y el mismo puntaje.
   **Si agregás una respuesta al banco, corré `npx jest ai-answer-bank`** (verifica letra y duplicados).
   "Jugador Promesa" envejece: revisarla cada temporada.
- `POST /tutti-frutti/validate-round` (una ronda suelta) pide sesión y tiene límite de 20 por minuto: cada llamada
  gasta créditos del proveedor de IA.

## Multijugador (Socket.IO)

- Hay multijugador (sala privada con código, unirse con código y partida pública) para **Tutti Frutti, ahorcado,
  trivia, sopa de letras y memotest**. El desafío del día es individual.
- **Motor común** (`src/rooms/game-engine.ts`): salas, lobby, anfitrión, entradas/salidas, reconexión, "quedan menos de
  2" y el final (posiciones, estadísticas y logros una sola vez). **Cada juego es un modo** (`src/rooms/modes/*.mode.ts`,
  registro en `modes/index.ts`, tipos en `modes/types.ts`) que define sus opciones (`validSettings`), la configuración
  pública, el máximo de jugadores y cómo se juega (`action(userId, type, payload)` + `view(userId)` armado por jugador).
  Los juegos nuevos heredan de `RoundMode` (`round-mode.ts`): cuenta regresiva → jugando → resultados → siguiente ronda.
- Configuración de la sala: `{ tematica, dificultad?, rounds, seconds }`; cada juego usa lo que necesita (ver tabla).
  **Las opciones están copiadas en el frontend** (`src/games/multiConfig.ts`): si cambiás una, cambiala en los dos repos.

  | Juego | tematica | dificultad | rounds | seconds | Cómo se juega |
  |---|---|---|---|---|---|
  | `tutti_frutti` | temática | — | rondas 1/3/5 | 30–120 por ronda | lo de abajo |
  | `trivia` | `todas` o categoría | mezcla/facil/medio/dificil | preguntas 5/10/15 | 10/15/20 por pregunta | misma pregunta a la vez; suma más el más rápido (+5 al primero que acierta); se revela cuando respondieron todos o se acabó el tiempo |
  | `ahorcado` | — | facil/medio/dificil | palabras 1/3/5 | 60/90/120 por palabra | misma palabra, cada uno con su pelota; puntos como solo + bonus 20/10/5 por orden de llegada; de los rivales sólo se ven errores y avance |
  | `sopa_de_letras` | temática | facil/medio/dificil | grillas 1/2/3 | 120–300 por grilla | misma grilla; cada palabra es del primero que la marca (5 + largo, × dificultad) |
  | `memotest` | tema | nivel | tableros 1/2/3 | 10/15/20 **por turno** | por turnos (máx. 4 jugadores); par = 10 puntos y seguís; si no, se ven 1,5 s y pasa el turno |
- **Nunca viajan secretos**: la correcta de la trivia, la palabra del ahorcado, dónde están las palabras de la sopa o el
  mazo del memotest llegan recién cuando corresponde (`view` se arma por jugador). Los tests lo controlan (`modes.spec.ts`).
- Tutti Frutti: el servidor sortea letra (de `letrasDe(temática)`, sin repetir
  en la partida) y categorías, controla el reloj y el ¡Basta! (corta para todos, sólo con todo completo), junta las
  respuestas, las valida con el mismo validador (UNA llamada por ronda para todos los jugadores) y puntúa con
  `scoring.ts`. Fases: `lobby → countdown (3 s) → playing → collecting (≤2 s) → validating → results (10 s) → … → finished`.
- El estado de cada sala vive **en memoria** (una sola instancia en Render). En la base quedan sala, jugadores,
  partida, rondas y respuestas. Si el server se reinicia, las partidas en curso se pierden y las salas vuelven al lobby.
- `rooms.gateway.ts`: la conexión se autentica con el JWT en el handshake (`io(url, { auth: { token } })`, middleware
  antes de aceptar). El userId sale **siempre** del token. Eventos (todos con respuesta `{ ok, error }`):
  `room:join|leave|settings|start|again`, `round:answers {answers, final?}` y `round:basta {answers}` (Tutti Frutti),
  `game:action {type, payload}` (los demás: trivia `answer {opcion}`, ahorcado `letter {letra}` / `guess {respuesta}`,
  sopa `mark {desde, hasta}`, memotest `flip {carta}`), `queue:join {game, tematica, size}`, `queue:leave`. El servidor manda `room:state` (estado completo, armado por jugador:
  cada uno ve sólo sus respuestas), `queue:state` y `queue:matched {code}`.
- HTTP: sólo `POST /rooms {game?, tematica?, dificultad?, rounds?, seconds?}` (crea sala privada, devuelve `{code}`; sin
  `game` es Tutti Frutti) y `GET /rooms/:code`. La sala guarda de qué juego es (`rooms.game`, migración
  `20261013120000_salas_por_juego`).
  La API vieja por votos (start/answers/close/vote/tally/finish) se borró. La tabla `votes` quedó sin uso: con IA como
  árbitro y ranking/ELO, los votos entre jugadores se pueden arreglar entre amigos.
- Reglas: 2 a 8 jugadores (memotest: 2 a 4). Desconexión en el lobby → sale a los 15 s.
  Recarga en partida → vuelve con lo que había escrito. Anfitrión desconectado 10 s → pasa al siguiente. Menos de 2
  conectados por 20 s → termina (los que no volvieron cuentan como abandono = perdida).
- Abandonar (botón Volver / `room:leave`) en plena partida = perdida, y a los demás les llega "X abandonó la partida."
  En el memotest, si se va o se desconecta el del turno, pasa al siguiente.
- Al final, `RoomsService.finishMatch` (una sola vez, en transacción): partidas, victorias, puntos, rachas,
  **estadísticas del juego**, ELO, ligas y logros (con `game` y `extra` del modo).
- **Empate en el primer puesto** (dos o más sin abandonar con los mismos puntos más altos, > 0): **nadie gana**. En las
  posiciones cada uno tiene `result`: `draw` los empatados arriba, `loss` el resto (`win` sólo el único primero) y
  `won = false` para todos: cuenta como jugada, no como ganada, la racha se corta (igual que el empate contra la
  máquina) y no da logros de ganar (`campeon_del_barrio`, `*_multi`). En el ELO, entre los que tienen los mismos
  puntos cuenta 0,5 y contra los de abajo, victoria (`eloMultiplayer`). En `match_results` queda `won = false`; cómo
  terminó se guarda en `matches.state.resultado` (`{tipo: 'ganador'|'empate'|'sin_ganador', …}`, sin migración).
  `room:state` del final trae `final.empate` y `final.empatados` (nombres de usuario) para que el frontend muestre
  "¡Empate!". Un empate más abajo no cambia nada.
  Si la IA no validó algo (Tutti Frutti) o no se jugó ninguna ronda, no cuenta.
- Cola pública (`matchmaking.ts`): por juego, temática (sólo Tutti Frutti) y tamaño (`pocos` 2–4, `muchos` 5–8; el
  memotest sólo `pocos`); con el mínimo espera 10 s por más y arma la sala con la configuración pública del juego
  (Tutti Frutti: 3 rondas de 60 s; sopa y memotest: temática al azar), que arranca sola cuando entran todos (o a los 15 s con ≥2).

## Plataforma de juegos

- Catálogo en `src/games/games.ts` (`GET /games`, público): `tutti_frutti`, `ahorcado`, `trivia`, `trivia_diaria`,
  `sopa_de_letras`, `memotest`. **Nunca cambies el id de un juego** (queda en la base). `available: false` = "Próximamente".
- `matches.game` dice de qué juego es cada partida y `matches.state` (JSON) guarda el estado que sólo conoce el
  servidor (palabra, respuestas correctas…). **Nunca mandes `state` entero al navegador.**
- `game_stats`: estadísticas por usuario y juego (partidas, ganadas, puntos, mejor puntaje, rachas). Los totales
  generales siguen en `profiles`. `StatsService.recordMatchResult({ won, points, game })` actualiza los dos.
- Para un juego nuevo usá `GameResultsService` (`src/games/game-results.service.ts`): `createMatch` (con el estado
  secreto), `loadActive` (404 si no es tuyo, 409 si terminó), `saveState`, `finish` (una sola vez, en transacción:
  estadísticas generales y del juego, `match_results` para las ligas y logros) y `closeAbandoned` (las que quedaron
  sin terminar cuentan como perdidas con 0 puntos). El resultado y los puntos los calcula el juego en el servidor.
- `multiplayer: true` en el catálogo = tiene menú "¿Cómo querés jugar?" y salas (todos menos el desafío del día).
- ELO: jugando solo, sólo Tutti Frutti lo mueve (`hasElo`, contra la máquina). **En multijugador todos los juegos lo
  mueven** (hay rivales). Todos cuentan para las ligas y el ranking.
- Ranking por juego: `GET /users/ranking?game=<id>&period=…` y `GET /users/me/ranking?game=…`. `GET /users/me/games`
  devuelve las estadísticas por juego.
- Migración `20261012130000_plataforma_juegos` (sin aplicar): copia los totales de cada perfil a `game_stats` como
  Tutti Frutti (hasta ahora era el único juego).

## Ahorcado "Que no muera la redonda" (`src/ahorcado/`)

- `POST /ahorcado {dificultad: facil|medio|dificil}` → pista (categoría) y máscara. `POST /ahorcado/:id/letra {letra}`,
  `POST /ahorcado/:id/arriesgar {respuesta}` (fallar = 1 error) y `POST /ahorcado/:id/rendirse`. **El servidor guarda
  la respuesta en `matches.state` y corrige cada letra; la respuesta (con tildes) viaja recién al terminar.**
- Se ignoran tildes y mayúsculas; la Ñ es una letra aparte. Espacios y signos se ven desde el principio.
- 6 errores = "murió la redonda". Puntos al ganar: base (60/90/130 según dificultad) − 10 por error + hasta 30 por
  rapidez (−1 cada 5 s), mínimo 10. Perder = 0. Partidas sin terminar por más de 30 min = perdidas.
- Banco en `ahorcado-bank.ts` (sólo nombres reales y conocidos, y palabras futboleras). Pistas: Jugador, Equipo, Selección,
  Estadio, DT, Jugada, Palabra futbolera, Posición, Reglamento, Equipamiento, Partes de la cancha, Torneo y Premio
  (la pista nunca puede ser parte de la respuesta: "Director técnico" va con "Palabra futbolera", no con "DT"). Logros: `redonda_intacta`, `ahorcado_crack`, `ahorcado_diez`.

## Trivia (`src/trivia/`)

- `GET /trivia/categorias`, `POST /trivia {categoria?, dificultad?}` → primera pregunta (texto y 4 opciones
  mezcladas; **la correcta queda en `matches.state`**). `POST /trivia/:id/responder {opcion: 0-3 | null}` → si fue
  correcta, cuál era, puntos y la siguiente. 10 preguntas de 20 s; el tiempo lo mide el servidor (2 s de margen por la
  red: más tarde no vale aunque sea la correcta). Puntos: 10/15/20 según dificultad + hasta 10 por rapidez.
  Aprobás (= partida ganada) con 6 aciertos.
- Banco en `trivia-bank.ts` (más de 200 preguntas). **Sólo datos seguros y que no cambian**: nada de "cuántos
  Mundiales ganó X" ni récords que se mueven con cada Mundial (el test lo controla). Reglas reutilizables
  (puntaje, mezcla, elegir preguntas) en `trivia-rules.ts`. Logros: `trivia_perfecta`, `trivia_rapida`, `trivia_diez`.

## Desafío del día (`src/desafio-diario/`)

- Misma serie para todos cada día argentino (cambia a medianoche, UTC−3): 1 fácil, 2 medias y 2 difíciles del banco
  de la trivia, elegidas y mezcladas con una semilla que depende sólo de la fecha (`preguntasDelDia`).
- Tabla `daily_challenges` (migración `20261012140000_desafio_diario`, sin aplicar): una fila por usuario y día con
  índice único → **una sola vez por día**. Si recarga a la mitad, retoma (el reloj sigue corriendo en el servidor; si
  la pregunta venció mientras no estaba, cuenta como "sin tiempo").
- `GET /desafio-diario/hoy` (si ya jugó, resultado + texto para compartir + racha), `POST /desafio-diario/empezar`,
  `POST /desafio-diario/:id/responder {opcion|null}`, `GET /desafio-diario/tabla` (tabla del día con mi posición).
- Racha = días seguidos jugados (si ayer no jugó, arranca de nuevo). Texto para compartir con 🟩🟥⬛, sin spoilers.
  Gana (cuenta como partida ganada) con 3 de 5. Logros: `diaria_perfecta`, `diaria_racha_7`, `diaria_racha_30`.
- Con 40 preguntas difíciles en el banco, las difíciles se repiten cada ~20 días: sumá preguntas al banco de la trivia.

## Sopa de letras (`src/sopa/`)

- `POST /sopa {tematica, dificultad}` → grilla y lista de palabras (**las posiciones quedan en `matches.state`**).
  `POST /sopa/:id/marcar {desde:{f,c}, hasta:{f,c}}` → el servidor verifica que la línea sea exactamente una palabra
  escondida (en cualquiera de los dos sentidos). `POST /sopa/:id/terminar` (rendirse o se acabó el tiempo).
- Fácil 10×10, 6 palabras, horizontal/vertical, 3 min; medio 12×12, 8, + diagonales, 4 min; difícil 14×14, 10, en
  las 8 direcciones (también al revés), 5 min. Puntos: 5 + largo por palabra, +30 y +1 cada 3 s sobrantes si las
  encuentra todas, × 1 / 1,3 / 1,6. Ganar = encontrarlas todas a tiempo (el servidor mide el tiempo).
- Palabras en `sopa-rules.ts` (`TEMATICAS_SOPA`, 7 temáticas; **si agregás una, sumala también en `src/api/sopa.ts` del
  frontend**): sólo A-Z, sin espacios ni Ñ, de 4 a 14 letras. Logros: `sopa_relampago`, `sopa_dificil`, `sopa_diez`.

## Memotest (`src/memotest/`)

- Pares de **texto con íconos propios** (sin escudos ni logos con derechos): clubes y apodos, jugadores y
  selecciones, estadios y clubes, jugadores y apodos, selecciones y apodos (`memotest-rules.ts`; **si agregás un tema,
  sumalo también en `src/api/memotest.ts` del frontend**). Niveles: 6/8/10 pares, 2/3/4 minutos.
- `POST /memotest {tema, nivel}` → sólo la cantidad de cartas (**el mazo queda en `matches.state`**).
  `POST /memotest/:id/voltear {carta}` revela esa carta; con la segunda dice si es par. `POST /memotest/:id/rendirse`.
- Puntos al completar: base (60/90/120) + 5 por cada movimiento por debajo de 2×pares + hasta 40 por rapidez.
  Si se acaba el tiempo: 5 por par encontrado. Logros: `memotest_elefante`, `memotest_dificil`, `memotest_diez`.

## Que no se repitan preguntas ni palabras

- Trivia, ahorcado y sopa de letras (solos y en multijugador) priorizan lo que el usuario **no vio**. Lo visto se
  guarda por usuario y juego en la tabla `contenido_visto` (`user_id`, `game`, `item_id`, `seen_at`; migración
  `20261013140000_contenido_visto`). `item_id`: id de la pregunta, texto de la palabra del ahorcado o palabra de la sopa.
- `ContenidoVistoService` (`src/games/contenido-visto.service.ts`): `leer(userIds, game)` es UNA consulta (`groupBy`,
  la última vez que lo vio cualquiera de esos usuarios) y `marcar(userIds, game, items)` es UNA (`INSERT … ON CONFLICT`
  que actualiza la fecha). Si la base falla, el juego sigue sin priorizar (nunca corta la partida).
- Reglas en `src/games/vistos.ts`: primero lo no visto (al azar); si no alcanza, lo visto hace más tiempo. Así no se
  repite nada hasta agotar todo lo que cumple los filtros (categoría/dificultad/temática) y después vuelve a empezar.
  Sin nada visto se elige exactamente igual que antes.
- Multijugador: al arrancar la partida, el modo lee lo visto por **todos** los jugadores de la sala juntos (prioriza lo
  que no vio ninguno), elige todo lo de la partida (todas las palabras del ahorcado y todas las grillas de la sopa) y lo
  marca como visto para todos. Los modos lo reciben en `deps.vistos` (opcional: sin eso eligen como siempre).
- El **desafío del día no lo usa**: tiene que ser igual para todos (un test compara con las preguntas de antes).

## Logros

- Definiciones en `src/achievements/achievements.definitions.ts` (condición = función sobre las estadísticas y la
  partida). Un logro con `game` sólo se revisa con partidas de ese juego; sin `game` es general. El contexto trae
  las estadísticas del juego (`gameMatchesPlayed`, …) y datos propios de la partida en `extra`. En la base (`user_achievements`) sólo se guarda cuál y cuándo.
  **Nunca cambies el id de un logro existente.**
- Cada juego nuevo tiene 3 logros jugando solo y 1 por ganar en multijugador (`ahorcado_multi`, `trivia_multi`,
  `sopa_multi`, `memotest_multi`). En multijugador, la trivia y el ahorcado pasan `extra` (aciertos, errores…) así
  también valen sus logros de "partida perfecta".
- Se otorgan al terminar una partida (solo o multijugador), dentro de la misma transacción que las
  estadísticas (`AchievementsService.unlockFor`). `GET /users/me/achievements` los lista todos.

## Recuperar contraseña

- `POST /auth/forgot-password {email}` → 200 con **el mismo mensaje exista o no la cuenta** (el trabajo se hace sin
  esperar, para que tarde lo mismo). Crea un token de un solo uso que vence en 1 h; en `password_resets` se guarda
  **sólo el hash SHA-256** (migración `20261012150000_recuperar_contrasena`). Un pedido nuevo anula los anteriores.
  Límite: 3 por minuto por IP.
- `POST /auth/reset-password {token, password}` → mismas reglas de contraseña que el registro; marca el token como
  usado (una sola vez aunque lleguen dos pedidos juntos) y anula los demás. 400 si es inválido o venció. Límite 5/min.
- Mails: `src/mail/mail.service.ts`, proveedor por variables (`MAIL_PROVIDER=brevo|resend|smtp`, ver `.env.example`).
  **En Render (plan gratis) usar `brevo`**: Render bloquea SMTP y Brevo se usa por su API HTTP
  (`POST https://api.brevo.com/v3/smtp/email`, header `api-key`). El remitente sale de `MAIL_FROM` ("Nombre <mail>",
  verificado en Brevo). Timeout de 10 s. Si falta la clave o Brevo responde error, sólo se loguea (sin la clave ni datos
  del mail) y el usuario ve el mensaje de siempre. Tests con `fetch` mockeado en `mail.service.spec.ts`.
  Sin configurar no manda nada y lo avisa en el log; **fuera de producción el link se imprime en la consola**
  (nunca en producción). `FRONTEND_URL` arma el link (`/restablecer-contrasena?token=…`).

## Panel de administración (`src/admin/`, sólo lectura)

- **Acceso lo decide el backend**: `ADMIN_EMAILS` (mails separados por coma, en minúsculas). `AdminGuard` busca el email
  del usuario del token **en la base** y lo compara. Orden de guards: `ThrottlerGuard` (30 pedidos/min) →
  `AuthGuard('jwt')` (sin sesión 401) → `AdminGuard` (no admin o sin variable → **404 igual al de una ruta que no
  existe**, para no revelar el panel). `GET /users/me` devuelve `isAdmin` (sólo para mostrar el botón).
- Endpoints (todos GET, `?periodo=hoy|7d|30d|todo`, por defecto `7d`; "hoy" y los días en hora argentina, 7 y 30 días
  cuentan hoy): `/admin/usuarios`, `/admin/partidas`, `/admin/ia`, `/admin/contenido`.
- **Nunca** devuelve contraseñas, hashes, tokens, fechas de nacimiento, id de Google ni claves de la IA. De los usuarios:
  usuario, fecha de alta y si entró con Google; el email sólo en los últimos 20 registros. Un test lo controla.
- Todo se calcula en la base: una consulta SQL por dato (`AdminService`, cada una con un comentario `/* admin:… */`;
  los tests verifican que todas sean `SELECT`). Las cuentas que no dependen de la base están en `admin-calculos.ts`.
- Qué mide cada cosa:
  - **Activos** = usuarios con una partida solo empezada o una partida que contó (`match_results`) en hoy/7/30 días.
  - **Salas y conectados AHORA**: del motor en memoria (`GameEngine.liveSummary()`, `Matchmaking.waiting`).
  - **Abandonadas**: partidas solo con `status = 'abandoned'`; del multijugador, jugadores con `abandoned` en `match_results`.
  - **IA**: una partida de Tutti Frutti cuenta "sin validar" si alguna respuesta quedó `unverified`; % de válidas sobre
    respuestas escritas que la IA evaluó. **Gasto = partidas validadas × US$ 0,01 (estimado**; el real está en la
    consola del proveedor). Se muestra `AI_PROVIDER` y el modelo, nunca la clave.
  - **Contenido**: preguntas (trivia sola + desafío del día, desde `matches.state`; "más falladas" < 50% de acierto, "más acertadas" ≥ 50%), palabras del ahorcado solo (% de
    derrotas, desde `matches.state` + `match_results`), temáticas de sopa y temas de memotest (`matches.tematica` o el
    estado) y letras del Tutti Frutti (`rounds.letter`). Los rankings piden al menos 3 veces (`MIN_VECES`).
  - **No se guarda** (y el panel lo dice): preguntas/respuestas de la trivia multijugador y palabras del ahorcado
    multijugador (viven en memoria).

## Login con Google

- `POST /auth/google` con `{ credential }` (ID token de Google Identity Services). Responde igual que
  `/auth/login`. Lógica en `src/auth/google-auth.service.ts`:
  1. Si ya hay un usuario con ese `google_id`, entra.
  2. Si no, **sólo si Google dice `email_verified: true`**, se une a la cuenta con ese email o se crea una nueva
     (sin contraseña). Un email no verificado nunca se usa para unir cuentas.
- Sin `GOOGLE_CLIENT_ID` el endpoint responde 503 y el resto de la app funciona igual.

## Seguridad

Checklist pre-producción (rama `feat/seguridad`, octubre 2026). ✅ hecho · ⚠️ hecho pero falta un paso a mano.

| # | Punto | Estado | Dónde / cómo |
|---|---|---|---|
| 1 | Cabeceras HTTP | ✅ | `helmet` en `app.setup.ts` (`security/security-headers.ts`): HSTS 1 año + subdominios, nosniff, X-Frame-Options DENY, Referrer-Policy `strict-origin-when-cross-origin`, CSP `default-src 'none'` (la API sólo devuelve JSON). Un test comprueba que no rompe CORS (con preflight) ni el handshake de Socket.IO |
| 2 | Contraseñas comunes | ✅ | `dto/common-passwords.ts`: las 1000 más usadas de SecLists con 8–72 caracteres + algunas argentinas ("argentina10", "bocajuniors"…). Registro y `reset-password` → 400 "Esa contraseña es muy común…". Copia idéntica en el frontend |
| 3 | Límite por email | ✅ | `email-attempt-limiter.ts` (ver "Auth"). En memoria: con varias instancias habría que pasarlo a Redis |
| 4 | Mails descartables | ✅ | `dto/disposable-domains.ts` (~9900 dominios de `disposable-email-domains`, copiada el 14/10/2026). Un test controla que gmail/hotmail/outlook/fibertel/etc. nunca queden bloqueados |
| 5 | Captcha Turnstile | ⚠️ | `turnstile.service.ts`: con `TURNSTILE_SECRET_KEY`, `/auth/register` exige `captchaToken` y lo verifica con Cloudflare (timeout 8 s; 400 si es inválido, 503 si Cloudflare no responde: nunca deja pasar sin verificar). Sin la variable, se saltea y lo avisa en el log. Nunca se loguean el token ni la clave. **Falta crear el widget y cargar las claves** |
| 6 | Aislamiento entre usuarios | ✅ | Cada juego busca la partida y compara `user_id` con el del token (404 igual a "no existe"). `test/seguridad.e2e-spec.ts` lo prueba con dos usuarios reales en solo-matches, ahorcado, trivia, sopa, memotest y desafío, y recorre `/users`, `/users/:id`, rankings, `/rooms/:code` y `room:state` buscando `password_hash`, `email`, `birth_date`, `google_id` o `first/last_name` |
| 7 | Validación de entradas | ✅ | El e2e manda payloads raros (tipo equivocado, null, objetos, strings gigantes, arrays de 1000) a **todos** los endpoints con body/query y a **todos** los eventos de Socket.IO, también en plena partida de cada juego: nunca 500, siempre `{ ok }`. Arreglado: un body que no es objeto (`[]`) daba 500 (`authValidationPipe` ahora lo rechaza), límites de largo en `validate-round`/`solo-matches`, y `WsSafeAckInterceptor`: si un handler de Socket.IO tira una excepción, el cliente igual recibe `{ ok: false }` |
| 8 | RLS en Supabase | ⚠️ | Migración `20261014120000_rls_todas_las_tablas`: `ENABLE ROW LEVEL SECURITY` en las 17 tablas de public (con `_prisma_migrations`), sin políticas. **Sin aplicar en producción** (primero backup). Ver abajo |
| 9 | CI | ✅ | `.github/workflows/ci.yml` en cada PR: `npm ci`, `prisma generate`, `jest`, `build`, `npm audit --audit-level=high --omit=dev --include=prod` y los e2e de seguridad contra una PostgreSQL de servicio. Hoy 0 vulnerabilidades en producción (no hay nada ignorado). `.github/dependabot.yml`: npm y github-actions semanal, con 14 días de espera |
| 10 | Secretos en el repo | ✅ | Job `secretos` del CI: gitleaks 8.30.1 (checksum verificado) sobre todo el historial. Hoy sin hallazgos |

- **RLS: por qué la app sigue andando.** Supabase publica el esquema `public` por su API REST con los roles
  `anon`/`authenticated`: sin RLS, cualquiera con la "anon key" podría leer las tablas sin pasar por este backend.
  Con RLS y sin políticas, esos roles no ven ninguna fila. Prisma entra como **dueño** de las tablas (el usuario que
  corrió las migraciones) y en PostgreSQL el dueño no está sujeto a RLS (no usamos `FORCE ROW LEVEL SECURITY`).
  Probado con un usuario **sin** superusuario ni `BYPASSRLS` y dueño de las tablas (el superusuario se saltea RLS
  siempre, así que con él la prueba no valdría): pasa toda la suite e2e y un rol tipo `anon` ve 0 filas y no puede
  insertar. El CI repite esa prueba en cada PR. **Antes de aplicarla en producción**, confirmá en el SQL Editor de
  Supabase que el usuario de `DATABASE_URL` es el dueño:
  `SELECT current_user; SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public';`.
  Tabla nueva = activale RLS en su migración (el e2e falla si alguna queda sin RLS).
- **Migraciones y Render**: confirmá que el Build/Start Command de Render **no** corre `prisma migrate deploy`; si lo
  corre, mergear esta rama aplica RLS en producción sin el backup.
- **Token Bearer, no cookies (a propósito).** El frontend guarda el JWT en `localStorage` y lo manda en
  `Authorization: Bearer …`. Como el navegador nunca lo agrega solo (no es una cookie), otra página no puede hacer
  pedidos "en nombre" del usuario: **no hace falta protección CSRF**. La contra es que un XSS en el frontend podría
  leer el token: por eso React escapa todo, no usamos `dangerouslySetInnerHTML` con datos de usuarios y el
  frontend tiene una CSP (por ahora en modo Report-Only). Si algún día se pasa a cookies, hay que sumar CSRF
  (`SameSite` + token).
- **No hay uploads.** Ningún endpoint recibe archivos (los avatares son ids de una lista fija y se validan contra
  `avatars.ts`). `multer` está instalado sólo porque viene con `@nestjs/platform-express`. Si se agregan uploads,
  hay que limitar tamaño y tipo, y no servirlos desde el mismo dominio.

## Variables de entorno (ver `.env.example`)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | conexión a PostgreSQL |
| `JWT_SECRET` | firma de tokens. **Obligatoria con `NODE_ENV=production`** (si falta, el server no arranca) |
| `JWT_EXPIRATION` | duración del token (default `7d`) |
| `PORT` | puerto (Render lo define solo; default 3000) |
| `CORS_ORIGIN` | opcional, orígenes separados por coma; vacío = cualquiera |
| `GOOGLE_CLIENT_ID` | login con Google (opcional; mismo valor que `VITE_GOOGLE_CLIENT_ID` del frontend) |
| `TURNSTILE_SECRET_KEY` | captcha del registro (opcional; "Secret Key" del widget de Cloudflare Turnstile). Va con `VITE_TURNSTILE_SITE_KEY` del frontend |
| `ADMIN_EMAILS` | mails del equipo con acceso al panel `/admin` (separados por coma). Sin ella, nadie es admin |
| `AI_PROVIDER` | proveedor de IA: `gemini` (por defecto), `anthropic`, `openai` o `fake` (sólo fuera de producción) |
| `MAIL_PROVIDER`, `MAIL_FROM`, `BREVO_API_KEY`, `RESEND_API_KEY`, `SMTP_*` | envío de mails (recuperar contraseña). Opcional. En Render: `brevo` |
| `FRONTEND_URL` | URL del frontend para los links de los mails (default `http://localhost:5173`) |
| `AI_FAKE_DELAY_MS` | opcional, sólo con `AI_PROVIDER=fake`: demora simulada en ms (default 300) |
| `AI_MODEL` | opcional: cambia el modelo del proveedor |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | sólo hace falta la del proveedor elegido. Sin ella, todas las respuestas quedan "sin validar" (0 puntos) |

## Reglas para trabajar

- **Nunca** correr migraciones, seeds ni scripts contra la base de producción (Render). Para probar, usar una
  base local y pasar `DATABASE_URL` explícito.
- No commitear `.env` ni secretos.
- Trabajar en una rama y abrir PR contra `main`.
- Errores esperables (datos inválidos, duplicados) deben devolver 4xx, nunca 500.
- Para usar la base, inyectá `PrismaService` en el constructor. **No** lo agregues a los `providers` de
  un módulo: `PrismaModule` es global y cada copia extra abre otro grupo de conexiones.
- Nunca imprimas `DATABASE_URL` (ni ninguna variable con secretos) en los logs.
- Con `NODE_ENV=production`, si no hay conexión a la base, el servidor no arranca (el deploy falla
  y Render deja la versión anterior). Fuera de producción sólo avisa.
- Un usuario sólo puede modificar su propia cuenta (`/users/me`). No agregar endpoints que editen o
  borren usuarios por `:id` sin un sistema de roles.
