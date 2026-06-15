# FOLDER_STRUCTURE.md

# Estructura de Carpetas IA-Ready — Corta La Bocha

---

## 1. Principio

La estructura de carpetas define responsabilidades claras dentro del sistema.

Los agentes IA y desarrolladores deben respetar los límites de cada dominio, evitando mezclar:

- lógica de negocio
- presentación
- infraestructura
- tiempo real
- IA
- datos

El backend es la única fuente de verdad del juego.

---

## 2. Estructura General del Proyecto (NestJS Backend)

**Nota**: El proyecto utiliza NestJS (TypeScript) para el backend, no Django. La estructura actual refleja esta implementación.

```
corta-la-bocha/

├── src/
│ ├── app.module.ts
│ ├── main.ts
│ ├── app.controller.ts
│ ├── app.service.ts
│ │
│ ├── auth/
│ │ ├── auth.controller.ts
│ │ ├── auth.module.ts
│ │ ├── auth.service.ts
│ │ ├── jwt.strategy.ts
│ │ └── dto/
│ │
│ ├── users/
│ │ ├── users.controller.ts
│ │ ├── users.module.ts
│ │ ├── users.service.ts
│ │ └── dto/
│ │
│ ├── prisma/
│ │ ├── prisma.module.ts
│ │ └── prisma.service.ts
│ │
│ └── tutti-frutti/
│     ├── tutti-frutti.controller.ts
│     ├── tutti-frutti.module.ts
│     ├── tutti-frutti.service.ts
│     └── dto/
│         └── validate-round.dto.ts
│
├── test/
│ ├── app.e2e-spec.ts
│ ├── jest-e2e.json
│ └── tutti-frutti.e2e-spec.ts
│
├── prisma/
│ ├── schema.prisma
│ ├── migrations/
│ └── prisma.config.ts
│
├── docs/
│ ├── ARCHITECTURE.md
│ ├── API_GUIDELINES.md
│ ├── FOLDER_STRUCTURE.md
│ ├── STACK.md
│ ├── RULES.md
│ ├── WORKFLOW.md
│ └── PROJECT_CONTEXT.md
│
├── agents/
│ ├── ORCHESTRATOR.md
│ ├── BACKEND_AGENT.md
│ ├── FRONTEND_AGENT.md
│ ├── DEVOPS_AGENT.md
│ ├── QA_AGENT.md
│ └── SECURITY_AGENT.md
│
├── database/
│ └── schema.sql
│
├── templates/
│ ├── ADR_TEMPLATE.md
│ ├── FEATURE_SPEC_TEMPLATE.md
│ └── PR_CHECKLIST.md
│
├── checklists/
│ ├── ARCHITECTURE_CHECKLIST.md
│ └── RELEASE_READINESS_CHECKLIST.md
│
├── backend/ (Legacy Django - no activo)
│ ├── apps/
│ ├── config/
│ ├── manage.py
│ └── requirements.txt
│
├── docker-compose.yml
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.mjs
├── package.json
├── package-lock.json
├── .env.example
└── README.md
```
│ │ │
│ │ ├── components/
│ │ ├── hooks/
│ │ ├── services/
│ │ ├── stores/
│ │ ├── lib/
│ │ ├── types/
│ │ └── styles/
│ │
│ └── package.json
│
├── database/
│ ├── migrations/
│ ├── seeds/
│ └── football_knowledge_base/
│
├── infrastructure/
│ ├── docker/
│ ├── nginx/
│ ├── scripts/
│ └── github-actions/
│
├── docker-compose.yml
├── .env.example
└── README.md


---

## 3. Responsabilidad por Carpeta

| Carpeta | Responsabilidad | Agente |
|--------|----------------|--------|
| src/ | código NestJS (controladores, servicios, módulos) | Backend Agent |
| test/ | tests unitarios e integración E2E | QA Agent |
| prisma/ | esquema y migraciones de base de datos | Backend Agent |
| docs/ | documentación oficial | Orchestrator |
| agents/ | roles y responsabilidades | Orchestrator |
| database/ | datos/scripts SQL | Data Agent |
| templates/ | plantillas de ADR, specs, checklists | Orchestrator |
| docker-compose.yml | orquestación de contenedores | DevOps Agent |

---

## 4. Estructura de un Módulo NestJS

### Ejemplo: tutti-frutti/

```
src/tutti-frutti/

├── tutti-frutti.controller.ts
├── tutti-frutti.controller.spec.ts
├── tutti-frutti.module.ts
├── tutti-frutti.service.ts
├── tutti-frutti.service.spec.ts
└── dto/
    └── validate-round.dto.ts
```

---

### Responsabilidades por Archivo

#### controller.ts
- Decoradores HTTP (@Post, @Get, etc.)
- Parseo de parámetros y body
- Delegación al servicio
- Manejo de códigos HTTP

❌ **NO**: lógica de negocio

#### service.ts (CORE)
- Lógica de negocio
- Validaciones
- Cálculos
- Integraciones con API externas
- Conexión con repositorios

✅ **SÍ**: toda la complejidad va aquí

#### module.ts
- Registro de controladores
- Registro de providers (servicios)
- Configuración de módulos dependientes
- Exports de servicios

#### dto/ (Data Transfer Objects)
- class-validator decoradores
- class-transformer decoradores
- Tipado TypeScript
- Validación de entrada

❌ **NO**: lógica de negocio

#### *.spec.ts
- Tests unitarios con Jest
- Mocks de dependencias
- Cobertura de casos

#### *.e2e-spec.ts
- Tests de integración
- Request/Response reales
- Validación de toda la pila

---

## 5. Convenciones de Nombres
- Socket.IO / WebSockets
- tiempo real

---

### permissions.py
- roles
- ownership
- acceso a salas / partidas

---

## 6. Frontend (PWA Architecture)

### features/
- rooms
- matches
- tournaments
- rankings
- auth
- ai

---

### components/
- Button
- Modal
- Input
- Card
- Table

❌ sin lógica de negocio

---

### services/
- API calls
- auth.service
- rooms.service
- matches.service

---

### stores/
- auth.store
- match.store
- room.store
- socket.store

---

## 7. Dominios del Sistema

- auth
- users
- tenants (SaaS)
- rooms
- matches
- rounds
- tournaments
- rankings
- achievements
- categories
- answers
- validation
- scoring
- ai
- football_db
- realtime
- audit
- jobs

---

## 8. Reglas del Sistema

### Frontend NO puede:
- calcular puntos
- validar respuestas
- decidir ganadores
- modificar rankings

---

### Backend SÍ debe:
- validar todo
- calcular scoring
- manejar IA
- controlar ranking
- ejecutar reglas del juego

---

## 9. Principio SaaS

- todo pertenece a tenant_id
- aislamiento total de datos
- rankings separados por tenant
- salas independientes

❌ nunca queries globales sin tenant

---

## 10. Anti-Patrones

- lógica en frontend
- validación en cliente
- rankings en cliente
- duplicación de reglas
- saltar services
- hardcode futbolístico
- IA en frontend
- queries sin tenant

---

## 11. Principio Final

Cada módulo tiene una única responsabilidad.

El backend controla el juego.

El frontend solo muestra el estado.

La IA valida, juega y asiste al sistema, pero nunca rompe la fuente de verdad.