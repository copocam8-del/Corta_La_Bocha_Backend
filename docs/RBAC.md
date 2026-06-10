# RBAC.md
# Roles, Permisos, Scopes y Control de Acceso — Corta La Bocha

---

## 1. Principio

> Todo acceso debe estar controlado por rol, contexto de juego y scope.  
> El backend es la única autoridad de seguridad y decisión.

El frontend nunca decide permisos, solo refleja lo que el backend autoriza.

---

## 2. Roles globales (Sistema)

| Rol | Descripción |
|---|---|
| `system_admin` | Administración total del sistema |
| `tenant_admin` | Administración de un tenant / organización |
| `manager` | Gestión operativa del sistema |
| `operator` | Operación diaria |
| `viewer` | Solo lectura |
| `external_user` | Usuario externo (limitado) |

---

## 3. Roles de juego (Game Roles)

| Rol | Descripción |
|---|---|
| `player` | Jugador estándar en partidas |
| `room_host` | Creador y administrador de sala |
| `match_player` | Jugador activo dentro de una partida |
| `ai_player` | Jugador controlado por IA |
| `referee_system` | Sistema de validación (backend + IA) |
| `tournament_admin` | Administrador de torneo |

---

## 4. Scopes (Alcance de acceso)

| Scope | Descripción |
|---|---|
| `global` | Acceso total al sistema |
| `context` | Acceso limitado a un contexto de juego |
| `room` | Acceso dentro de una sala |
| `match` | Acceso dentro de una partida |
| `tournament` | Acceso dentro de un torneo |
| `own` | Solo recursos propios |
| `public` | Recursos públicos |

---

## 5. Contextos de juego (IMPORTANTE)

El sistema no depende solo de tenants, sino de contextos dinámicos:

- `public_matchmaking`
- `private_room`
- `tournament`
- `ranked_match`
- `custom_lobby`

Todo recurso de juego pertenece a un contexto.

---

## 6. Matriz de permisos (simplificada)

| Recurso | Acción | system_admin | tenant_admin | manager | operator | viewer | external_user |
|---|---|---:|---:|---:|---:|---:|---:|
| Usuarios | Crear | Sí | Sí | No | No | No | No |
| Usuarios | Ver | Sí | Sí | Sí | No | No | No |
| Rooms | Crear | Sí | Sí | Sí | Sí | No | Sí |
| Rooms | Ver | Sí | Sí | Sí | Sí | Sí | Sí |
| Matches | Gestionar | Sí | Sí | Sí | Sí | No | No |
| Rankings | Ver | Sí | Sí | Sí | No | Sí | No |
| Configuración | Modificar | Sí | Sí | No | No | No | No |

---

## 7. Reglas multi-contexto (juego)

- Todo `match`, `room` o `tournament` pertenece a un `context`
- Todo acceso debe validar:
  - context_id
  - role
  - participation (si el usuario está dentro)
- Ningún usuario puede acceder a datos de otro contexto activo

---

## 8. Jerarquía de autoridad en runtime

Orden de prioridad en ejecución:

1. `system_admin`
2. `referee_system` (backend + IA validación)
3. `tournament_admin`
4. `room_host`
5. `match_engine`
6. `player`
7. `ai_player`

> En conflictos de estado, siempre prevalece el nivel más alto.

---

## 9. Reglas específicas de IA

La IA está dividida en dos roles:

### IA como jugador (`ai_player`)
- Puede generar respuestas
- Puede simular comportamiento humano
- Puede cometer errores
- Debe respetar reglas del match

### IA como árbitro (`referee_system`)
- Valida respuestas
- Consulta base de datos futbolística
- Decide si una respuesta es válida o inválida
- NO modifica rankings directamente

### Prohibiciones de IA

- No puede alterar historial de partidas cerradas
- No puede modificar rankings globales directamente
- No puede cambiar resultados ya confirmados

---

## 10. Reglas multi-tenant / aislamiento lógico

Aunque exista concepto de tenant:

- El aislamiento real se hace por:
  - `context_id`
  - `room_id`
  - `match_id`
  - `tournament_id`

Reglas:

- Nunca queries globales sin filtro de contexto
- Nunca mezclar datos entre contextos activos
- Nunca exponer IDs de otro contexto

---

## 11. Permisos por acción (evaluación obligatoria)

Toda acción sensible debe responder:

- ¿Qué rol ejecuta la acción?
- ¿Dentro de qué contexto ocurre?
- ¿El usuario pertenece a ese contexto?
- ¿La acción es auditada?
- ¿La acción dispara eventos en tiempo real?
- ¿Puede ser ejecutada por IA?

---

## 12. Auditoría obligatoria

Toda acción crítica debe registrar:

- user_id
- role
- scope
- context_id
- action
- target_id
- timestamp

### Acciones auditables

- user.registered
- user.login
- room.created
- room.joined
- match.started
- match.finished
- round.finished
- answer.submitted
- answer.validated
- ranking.updated
- tournament.finished

---

## 13. Tests mínimos de seguridad

Para cada endpoint crítico:

- usuario no autenticado → denegado
- usuario fuera de contexto → denegado
- rol insuficiente → denegado
- usuario válido dentro del contexto → permitido
- acción queda auditada correctamente

---

## 14. Prohibiciones absolutas

- Nunca confiar en frontend para permisos
- Nunca exponer datos de otro contexto
- Nunca omitir validación de rol en backend
- Nunca permitir IA modificar rankings directamente
- Nunca saltarse el sistema de auditoría
- Nunca hacer queries sin scope/context filter

---

## OBJETIVO FINAL

Garantizar un sistema de permisos seguro, escalable y consistente para:

- partidas en tiempo real
- torneos
- rankings globales
- IA como jugador y árbitro
- arquitectura multi-contexto robusta