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

## 2. Estructura General del Proyecto


corta-la-bocha/

├── agents/
│ ├── ORCHESTRATOR.md
│ ├── BACKEND_AGENT.md
│ ├── FRONTEND_AGENT.md
│ ├── DEVOPS_AGENT.md
│ ├── QA_AGENT.md
│ ├── AI_AGENT.md
│ └── DATA_AGENT.md
│
├── docs/
│ ├── CONTEXT.md
│ ├── ARCHITECTURE.md
│ ├── API_GUIDELINES.md
│ ├── FOLDER_STRUCTURE.md
│ ├── STACK.md
│ ├── GAME_RULES.md
│ ├── DATABASE_SCHEMA.md
│ ├── SOCKET_EVENTS.md
│ ├── ROADMAP.md
│ └── SPRINT_0.md
│
├── backend/
│ ├── apps/
│ │ ├── auth/
│ │ ├── users/
│ │ ├── tenants/
│ │ ├── profiles/
│ │ ├── rooms/
│ │ ├── matches/
│ │ ├── rounds/
│ │ ├── tournaments/
│ │ ├── rankings/
│ │ ├── achievements/
│ │ ├── categories/
│ │ ├── answers/
│ │ ├── validation/
│ │ ├── scoring/
│ │ ├── football_db/
│ │ ├── ai/
│ │ ├── realtime/
│ │ ├── audit/
│ │ └── jobs/
│ │
│ ├── common/
│ │ ├── permissions/
│ │ ├── exceptions/
│ │ ├── middleware/
│ │ ├── constants/
│ │ └── utils/
│ │
│ ├── config/
│ │ ├── settings/
│ │ ├── asgi.py
│ │ ├── wsgi.py
│ │ ├── celery.py
│ │ └── urls.py
│ │
│ ├── tests/
│ ├── manage.py
│ └── requirements.txt
│
├── frontend/
│ ├── src/
│ │ ├── app/
│ │ ├── features/
│ │ │ ├── auth/
│ │ │ ├── rooms/
│ │ │ ├── matches/
│ │ │ ├── tournaments/
│ │ │ ├── rankings/
│ │ │ ├── profile/
│ │ │ └── ai/
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
| agents/ | comportamiento de IA y devs | Orchestrator |
| docs/ | documentación oficial | Orchestrator |
| backend/ | lógica del juego + IA + tiempo real | Backend Agent |
| frontend/ | PWA + UI + UX | Frontend Agent |
| database/ | datos futbolísticos | Data Agent |
| infrastructure/ | deploy, CI/CD | DevOps Agent |
| tests/ | calidad del sistema | QA Agent |

---

## 4. Estructura de un Dominio Backend


apps/rooms/

├── models.py
├── views.py
├── serializers.py
├── services.py
├── selectors.py
├── permissions.py
├── consumers.py
├── urls.py
├── events.py
└── tests/


---

## 5. Responsabilidad de Archivos

### models.py
- entidades
- relaciones
- constraints

❌ sin lógica de negocio

---

### services.py (CORE DEL SISTEMA)
- reglas del juego
- scoring
- validación (con AI + DB)
- rankings
- IA
- torneos
- matches

---

### views.py
- endpoints
- requests / responses

❌ sin lógica de negocio

---

### selectors.py
- queries complejas
- estadísticas
- rankings

---

### consumers.py
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