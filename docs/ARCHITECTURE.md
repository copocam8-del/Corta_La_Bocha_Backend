# ARCHITECTURE.md

# Arquitectura del Sistema — Corta La Bocha

---

## 1. Principio Rector

> El backend es la única fuente de verdad (Source of Truth).

El frontend únicamente representa el estado del juego y envía acciones del usuario.

Ninguna regla de puntuación, validación de respuestas, ranking, torneos o lógica competitiva debe depender del cliente.

---

## 2. Objetivos Arquitectónicos

La arquitectura debe ser:

- Modular
- Escalable (SaaS multi-tenant)
- Testeable
- Mantenible
- Segura
- Orientada a tiempo real
- Optimizada para partidas multijugador
- Preparada para integración con IA
- PWA-first (instalable, offline parcial)
- Documentada y entendible por agentes IA

---

## 3. Capas del Sistema

```txt
Frontend (Next.js PWA)
        ↓
API Controllers (NestJS)
        ↓
DTOs / Validation Layer
        ↓
Application Services (Business Logic)
        ↓
Domain Layer (Reglas del juego)
        ↓
Repositories
        ↓
PostgreSQL
Servicios Transversales
Redis → cache / rankings / sesiones
Socket.IO → tiempo real
Auth → autenticación (JWT / OAuth)
AI Engine → validación + oponente
Football Knowledge Base → datos futbolísticos
Background Jobs → colas (BullMQ)
4. Regla de Service Layer

Toda lógica de negocio debe vivir dentro de services/.

Permitido en Services
validación de respuestas
cálculo de puntajes
reglas del juego
gestión de rondas
gestión de partidas
gestión de salas
torneos
ranking global
ranking por torneo
lógica de IA
auditoría de eventos
integración con APIs externas
Prohibido en Controllers
lógica de negocio
cálculo de puntajes
validación de respuestas
decisiones del juego
modificación de rankings
Prohibido en Frontend (PWA)
lógica competitiva
validación de respuestas
cálculo de resultados
rankings oficiales
reglas del juego
5. Módulos Principales
Módulo	Responsabilidad
Auth	login / registro / sesiones
Users	perfiles
Tenants	SaaS multi-tenant
Rooms	salas de juego
Matches	partidas
Rounds	rondas
Categories	categorías futbolísticas
Answers	respuestas
Validation	validación con IA + DB
Scoring	sistema de puntos
Ranking	rankings globales
Tournaments	torneos
AI	motor de IA (juego + validación)
Realtime	Socket.IO
Football DB	base de conocimiento
Audit	eventos del sistema
6. Modelo de Datos
Entidad	Descripción
User	jugador
Tenant	organización SaaS
Profile	perfil público
Room	sala
Match	partida
Round	ronda
Answer	respuesta
Category	categoría
Ranking	ranking global
Tournament	torneo
FootballEntity	jugador / equipo / DT
AIProfile	configuración IA
Relaciones Principales
Tenant
 ├── Users
 ├── Rooms
 ├── Tournaments

User
 ├── Profile
 ├── Matches
 ├── Rankings

Room
 └── Players

Match
 ├── Rounds
 ├── Players
 └── Scores

Round
 ├── Letter
 ├── Answers
 └── ValidationResult
7. Base de Conocimiento Futbolística
jugadores (activos / históricos)
equipos
selecciones
técnicos
estadios
clásicos
apodos
campeones
goleadores
eventos históricos
8. Sistema de IA
1. Validación IA (OBLIGATORIO)
valida respuestas
verifica categorías
cruza base de datos
2. IA Jugador
responde como humano
simula tiempos
ajusta dificultad
comete errores
Dificultades
Fácil → 50%
Medio → 70%
Difícil → 90%
Experto → 98%
9. Tiempo Real (Socket.IO)
Sala
room.created
room.joined
room.left
room.closed
Partida
match.started
match.finished
Ronda
round.started
round.finished
letter.generated
Jugador
player.ready
player.submitted
player.basta
Sistema
score.updated
ranking.updated
validation.completed
ai.response.generated
10. Sistema SaaS (Multi-Tenant)
todo pertenece a tenant
rankings separados
usuarios aislados
salas independientes

❌ nunca queries globales sin tenant_id

11. Sistema de Ranking

Solo backend.

Factores:
victorias
puntos
racha
precisión
torneos
12. Auditoría
user.registered
user.login
room.created
room.joined
match.started
match.finished
round.finished
answer.submitted
answer.validated
ranking.updated
tournament.finished
13. Stack Tecnológico
Frontend
Next.js
React
TypeScript
Tailwind
PWA
Backend
NestJS
TypeScript
Infra
PostgreSQL
Redis
Socket.IO
BullMQ
Docker
14. Anti-Patrones
lógica en frontend
validación en cliente
ranking en cliente
duplicación de reglas
saltar services
queries sin tenant
IA en frontend
hardcode de datos futbolísticos
OBJETIVO FINAL

Construir Corta La Bocha como:

SaaS global multi-tenant
PWA instalable
juego en tiempo real
sistema competitivo de rankings
IA integrada (validación + jugador)
arquitectura escalable global