# SPRINT_0.md
# Sprint 0 — Cimientos del Proyecto (Corta La Bocha)

---

## 1. Regla de oro

> No se programan features de negocio en Sprint 0.

El objetivo del Sprint 0 es construir la base técnica, no la aplicación final.

---

## 2. Objetivo del Sprint 0

Construir una arquitectura sólida, escalable y consistente que permita desarrollar el juego sin reescribir infraestructura después.

---

## 3. Distribución del esfuerzo

| Área | Porcentaje |
|---|---:|
| Cimientos técnicos y arquitectura | 70% |
| Preparación funcional mínima | 30% |
| Features de negocio | 0% |

---

## 4. Backend base (entregables)

El backend debe quedar listo para escalar módulos sin refactor global.

### Incluye:

- repositorio backend inicial
- configuración NestJS
- configuración de entorno (.env)
- conexión a PostgreSQL
- conexión a Redis (básica)
- módulo de usuarios base
- autenticación base (JWT o equivalente)
- sistema de permisos base (RBAC inicial)
- estructura modular por dominios
- service layer obligatorio
- healthcheck endpoint
- logging estructurado
- tests mínimos de infraestructura

---

## 5. Frontend base (entregables)

El frontend debe ser solo infraestructura UI + conexión.

### Incluye:

- repositorio frontend inicial
- Next.js (o equivalente definido)
- Tailwind CSS
- layout base (app shell)
- sistema de routing
- cliente HTTP (fetch/axios wrapper)
- integración básica con auth
- manejo de estado (loading / error / empty)
- base de design system (componentes UI mínimos)
- estructura por features

---

## 6. DevOps inicial

Infraestructura mínima para desarrollo local y despliegue futuro.

### Incluye:

- Dockerfile backend
- Dockerfile frontend
- docker-compose completo
- PostgreSQL container
- Redis container
- reverse proxy (Nginx o equivalente)
- variables de entorno documentadas
- scripts de arranque local
- logging básico
- README de ejecución local

---

## 7. Documentación obligatoria

Antes de avanzar a Sprint 1 deben existir completos:

- PROJECT_CONTEXT.md
- ARCHITECTURE.md
- STACK.md
- RULES.md
- FOLDER_STRUCTURE.md
- WORKFLOW.md
- RBAC.md
- API_GUIDELINES.md

---

## 8. Definition of Done (Sprint 0)

Sprint 0 se considera completo cuando:

- el proyecto corre localmente sin errores
- frontend y backend se comunican correctamente
- autenticación base funciona
- sistema de permisos base funciona
- base de datos migra correctamente
- docker-compose levanta todo el sistema
- estructura modular está aplicada
- existen tests mínimos de infraestructura
- el sistema permite agregar features sin romper arquitectura

---

## 9. No permitido en Sprint 0

- features de negocio completas
- lógica de juego
- rankings
- sistema de IA funcional
- dashboards avanzados
- integraciones externas complejas
- optimizaciones de performance no necesarias
- cualquier lógica competitiva

---

## 10. Salida del Sprint 0

Al finalizar, el Orchestrator debe emitir:

```txt
SPRINT_0_STATUS: READY_FOR_FEATURES