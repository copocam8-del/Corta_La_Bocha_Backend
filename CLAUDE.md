# CLAUDE.md — Corta La Bocha (backend)

"Corta La Bocha" es un Tutti Frutti (Stop) de fútbol: se sortea una letra y los jugadores completan
categorías futboleras (Jugador, Equipo, DT, Estadio…). Equipo: Camila Copo, Augusto Trento y Nicolás Borda.
El frontend vive en `../Corta_La_Bocha_Frontend` (React 19 + Vite).

Hablá en español rioplatense y explicá simple: el equipo está aprendiendo.

## Stack real (lo que está en el código)

- **NestJS 11** + TypeScript, **Prisma 5** + **PostgreSQL**
- Auth con **JWT** (`@nestjs/jwt` + `passport-jwt`), contraseñas con **bcrypt**
- Tiempo real con **Socket.IO** (`src/rooms/rooms.gateway.ts`)
- Validación de respuestas con IA (OpenAI `gpt-4o-mini`) en `src/tutti-frutti/`. Sin IA las respuestas quedan
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

Varios `*.spec.ts` de otros módulos (rooms, users, categories, solo-matches) son los generados por Nest y
fallan porque no mockean sus dependencias. Los de `auth` y `tutti-frutti` sí funcionan.

## Estructura

```
src/
  main.ts              arranque: PORT (Render), CORS_ORIGIN opcional
  app.module.ts        ConfigModule global + módulos
  auth/                registro, login, JWT
    jwt.config.ts      ÚNICO lugar que lee JWT_SECRET / JWT_EXPIRATION
    auth-validation.pipe.ts  ValidationPipe sólo de /auth, errores agrupados por campo
    dto/auth-rules.ts  reglas de registro (largos, regex, edad mínima)
  users/               perfil (/users/me)
  rooms/               salas multijugador + gateway Socket.IO
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
  `main.ts` tiene `trust proxy` para que Render pase la IP real.
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
  estadísticas una sola vez). Las reglas están en `src/solo-matches/solo-quick.ts`.
- Multijugador: `POST /rooms/:code/matches/:matchId/rounds/:roundId/tally` suma puntos una sola vez por ronda y
  `POST /rooms/:code/matches/:matchId/finish` decide el ganador y suma partidas/victorias/rachas.
  **El frontend multijugador todavía es una simulación y no llama a estos endpoints.**
- Perfil: `PUT /users/me` valida con el pipe de auth. El avatar se elige de `src/users/avatars.ts`
  (mismo set en el frontend). `GET /users/me/ranking` y `GET /users/ranking` (top 50, datos públicos).

## Validación de respuestas y puntaje

1. **En código, antes de la IA** (`src/tutti-frutti/answer-rules.ts`): que no esté vacía, que tenga al menos 2 letras
   y que empiece con la letra. Se ignoran tildes, mayúsculas y signos. Con artículo ("La Bombonera") vale la letra
   del artículo o la de la palabra siguiente. "Estadio", "Clásico", "Derbi" y "de" **nunca** cuentan en sus categorías.
2. **Con IA, una sola llamada por ronda** (`TuttiFruttiValidatorService.validateAnswers`): todas las respuestas
   (de todos los jugadores, incluida la máquina) van juntas, **como datos JSON** en el mensaje del usuario; el prompt
   de sistema dice que nunca se obedezcan instrucciones escritas en una respuesta. Devuelve por cada una `isValid`,
   `canonical` (nombre "oficial", ej. "mesi" → "Lionel Messi") y `reason` en español.
   - El schema es `strict`: **todos** los objetos necesitan `additionalProperties: false` (si no, OpenAI responde 400).
   - Caché en memoria por (categoría, letra, respuesta normalizada), hasta 5000 entradas.
   - Si OpenAI falla, reintenta una vez. Si vuelve a fallar → `status: 'unverified'`, 0 puntos. Una partida solo con
     respuestas sin validar se termina pero **no cuenta** para estadísticas, ranking ni logros.
3. **Puntaje** (`src/tutti-frutti/scoring.ts`, lo usan la partida solo y el multijugador): por categoría, 20 si es el
   único con respuesta válida, 10 si es válida y nadie puso la misma (se compara el nombre canónico), 5 si otro puso
   la misma, 0 si no vale. En la partida solo, la máquina es un jugador más.
4. **Máquina rival**: responde desde `src/solo-matches/ai-answer-bank.ts` (por categoría y letra, sólo nombres reales;
   celdas vacías si no hay ninguno conocido). La dificultad cambia cuántas sabe y qué tan rápido escribe
   (`DIFICULTADES` en `solo-quick.ts`). Sus respuestas pasan por la misma validación y el mismo puntaje.
   **Si agregás una respuesta al banco, corré `npx jest ai-answer-bank`** (verifica letra y duplicados).
   "Jugador Promesa" envejece: revisarla cada temporada.
- `POST /tutti-frutti/validate-round` (una ronda suelta) pide sesión y tiene límite de 20 por minuto: cada llamada
  puede gastar OpenAI.

## Logros

- Definiciones en `src/achievements/achievements.definitions.ts` (12 logros, condición = función sobre las
  estadísticas y la partida). En la base (`user_achievements`) sólo se guarda cuál y cuándo.
  **Nunca cambies el id de un logro existente.**
- Se otorgan al terminar una partida (solo o multijugador), dentro de la misma transacción que las
  estadísticas (`AchievementsService.unlockFor`). `GET /users/me/achievements` los lista todos.

## Login con Google

- `POST /auth/google` con `{ credential }` (ID token de Google Identity Services). Responde igual que
  `/auth/login`. Lógica en `src/auth/google-auth.service.ts`:
  1. Si ya hay un usuario con ese `google_id`, entra.
  2. Si no, **sólo si Google dice `email_verified: true`**, se une a la cuenta con ese email o se crea una nueva
     (sin contraseña). Un email no verificado nunca se usa para unir cuentas.
- Sin `GOOGLE_CLIENT_ID` el endpoint responde 503 y el resto de la app funciona igual.

## Variables de entorno (ver `.env.example`)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | conexión a PostgreSQL |
| `JWT_SECRET` | firma de tokens. **Obligatoria con `NODE_ENV=production`** (si falta, el server no arranca) |
| `JWT_EXPIRATION` | duración del token (default `7d`) |
| `PORT` | puerto (Render lo define solo; default 3000) |
| `CORS_ORIGIN` | opcional, orígenes separados por coma; vacío = cualquiera |
| `GOOGLE_CLIENT_ID` | login con Google (opcional; mismo valor que `VITE_GOOGLE_CLIENT_ID` del frontend) |
| `OPENAI_API_KEY` | validación con IA. Sin ella, todas las respuestas quedan "sin validar" (0 puntos) |

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
