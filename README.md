# Corta La Bocha · Backend

Servidor del juego (NestJS + Prisma + PostgreSQL). La guía técnica completa está en `CLAUDE.md`.

## Programar en tu compu sin tocar producción (paso a paso, Windows)

> ⚠️ El `.env` del proyecto puede apuntar a la base de **producción**. Para programar usá **siempre** la base local
> con `npm run db:local` y `npm run dev:local`: esos comandos se niegan a arrancar si la base no está en tu compu.

### Una sola vez

1. Instalá **Node.js 22 o más nuevo** (https://nodejs.org) y **Git** (https://git-scm.com).
2. (Opcional) Instalá **Docker Desktop** y dejalo abierto. Si no lo tenés, no pasa nada: el comando usa una
   PostgreSQL "portátil" que se descarga sola (embedded-postgres).
3. Abrí una terminal (PowerShell) en la carpeta del backend e instalá las dependencias:
   ```powershell
   npm ci
   ```
4. Copiá el archivo de ejemplo de variables locales:
   ```powershell
   Copy-Item .env.local.example .env.local
   ```
   Viene listo para usar: base local en el puerto 5433 e IA de prueba (`AI_PROVIDER=fake`, no gasta cuota).

### Cada vez que quieras programar

1. **Terminal 1** — levantá la base, aplicá las migraciones y cargá las categorías:
   ```powershell
   npm run db:local
   ```
   - Con Docker abierto, la base queda corriendo de fondo (para apagarla: `docker compose -f docker-compose.local.yml stop`).
   - Sin Docker, la primera vez tarda un par de minutos (descarga PostgreSQL). La base corre **mientras esa
     terminal esté abierta**; para apagarla, `Ctrl+C`.
   - Si sólo querés comprobar que todo anda: `npm run db:local -- --verificar` (levanta, migra y apaga).
2. **Terminal 2** — levantá el servidor con recarga automática:
   ```powershell
   npm run dev:local
   ```
   Queda en http://localhost:3000.
3. **Frontend** — en la carpeta del frontend: `Copy-Item .env.local.example .env.local` (una sola vez) y `npm run dev`.
   Abrí http://localhost:5173.

### Preguntas frecuentes

- **"apunta a … no a tu compu. Por seguridad no sigo"**: tu `.env.local` tiene una `DATABASE_URL` que no es
  `localhost`. Corregila (nunca uses la base de producción para programar).
- **Quiero empezar con la base vacía**: apagala y borrá la carpeta `.local-db` (sin Docker) o el volumen
  `clb-db-local` (`docker compose -f docker-compose.local.yml down -v`). Después, `npm run db:local` otra vez.
- **El puerto 5433 está ocupado**: cambiá el puerto en `DATABASE_URL` de `.env.local`.
- **Recuperar contraseña sin mails**: con `MAIL_PROVIDER` vacío, el link aparece en la terminal del servidor.
- **Crear una migración nueva**: con la base local corriendo, `$env:DATABASE_URL="<la de .env.local>"; npx prisma migrate dev --name algo`.
  Nunca contra producción.

---

# Kit de Documentación IA-Ready para Vibe Coding Profesional

Este kit convierte una idea de proyecto en un **sistema operativo documental** para trabajar con Claude, agentes IA o equipos de Vibe Coding sin perder arquitectura, reglas ni trazabilidad.

La premisa central es simple:

> La IA acelera el desarrollo, pero si no existe documentación ejecutable, acelera el caos.

## Objetivo

Crear una estructura mínima y escalable para que los agentes IA puedan desarrollar software real respetando:

- arquitectura documentada;
- reglas inviolables;
- stack definido;
- separación de responsabilidades;
- ownership por módulo;
- criterios de seguridad;
- flujo de trabajo ordenado;
- RBAC y multi-tenant desde el diseño;
- API consistente;
- Sprint 0 enfocado en cimientos, no en features.

## Estructura del kit

```txt
project/
├── docs/
│   ├── PROJECT_CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── STACK.md
│   ├── RULES.md
│   ├── FOLDER_STRUCTURE.md
│   ├── WORKFLOW.md
│   ├── RBAC.md
│   ├── API_GUIDELINES.md
│   └── SPRINT_0.md
├── agents/
│   ├── ORCHESTRATOR.md
│   ├── BACKEND_AGENT.md
│   ├── FRONTEND_AGENT.md
│   ├── DEVOPS_AGENT.md
│   ├── SECURITY_AGENT.md
│   └── QA_AGENT.md
├── prompts/
│   ├── MASTER_PROMPT.md
│   └── AGENT_TASK_TEMPLATE.md
├── templates/
│   ├── FEATURE_SPEC_TEMPLATE.md
│   ├── ADR_TEMPLATE.md
│   └── PR_CHECKLIST.md
└── checklists/
    ├── ARCHITECTURE_CHECKLIST.md
    └── RELEASE_READINESS_CHECKLIST.md
```

## Cómo usarlo

1. Completar `docs/PROJECT_CONTEXT.md`.
2. Definir la arquitectura en `docs/ARCHITECTURE.md`.
3. Completar stack y versiones en `docs/STACK.md`.
4. Mantener `docs/RULES.md` como constitución del proyecto.
5. Entregar `agents/ORCHESTRATOR.md` al agente coordinador.
6. Entregar cada archivo de `agents/` al agente correspondiente.
7. No iniciar features hasta completar `docs/SPRINT_0.md`.

## Regla principal

> Ningún agente debe improvisar arquitectura, carpetas, permisos, endpoints, estados ni lógica de negocio fuera de lo definido en estos documentos.
