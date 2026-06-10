# AGENT_TASK_TEMPLATE.md
# Plantilla para Asignar Tareas a Agentes — Corta La Bocha

---

## Tarea

`[Nombre corto y claro de la tarea]`

---

## Contexto

`[Explicación clara del problema, por qué existe y qué se intenta resolver]`

---

## Agente responsable

- `[Backend Agent / Frontend Agent / DevOps Agent / QA Agent / Security Agent / Orchestrator]`

---

## Agentes secundarios

- `[Agentes que deben leer, validar o colaborar]`

---

## Documentos fuente obligatorios

Antes de ejecutar la tarea, el agente debe leer:

- ARCHITECTURE.md
- STACK.md
- RULES.md
- FOLDER_STRUCTURE.md
- WORKFLOW.md
- RBAC.md (si aplica)

---

## Alcance

### Incluido

- Qué se debe implementar dentro de la tarea
- Casos de uso cubiertos
- Módulos afectados
- Integración con servicios existentes (si aplica)

### Excluido

- Cambios de arquitectura global
- Creación de nuevos dominios sin aprobación
- Lógica fuera del scope del sprint
- Modificaciones en frontend si la lógica es backend-owned (o viceversa)

---

## Archivos esperados

- `ruta/al/archivo_1`
- `ruta/al/archivo_2`
- `tests/unit/test_xxx`
- `tests/integration/test_xxx`

---

## Reglas específicas

- Toda lógica de negocio debe vivir en `services/`
- No modificar arquitectura sin aprobación del Orchestrator
- No crear nuevas carpetas sin actualizar FOLDER_STRUCTURE.md
- No duplicar lógica entre frontend y backend
- Toda validación crítica debe estar en backend
- Todo cambio relevante debe ser auditable
- No inventar reglas del juego (usar GAME_RULES.md)

---

## Criterios de aceptación

- La funcionalidad funciona end-to-end
- Backend valida correctamente reglas de negocio
- Frontend solo representa estado
- No existe lógica duplicada
- Tests pasan correctamente
- No hay regresiones
- Auditoría registrada correctamente
- Cumple multi-tenant si aplica

---

## Tests requeridos

- Tests unitarios del service afectado
- Tests de integración de API
- Tests de reglas de negocio
- Tests de casos inválidos
- Tests de permisos (si aplica)
- Tests de socket/realtime (si aplica)

---

## Riesgos

- Duplicación de lógica en frontend
- Inconsistencias en tiempo real (Socket.IO)
- Violación de reglas de ranking/scoring
- Errores de scope multi-tenant
- Dependencias incorrectas entre módulos

---

## Entrega esperada

El agente debe responder con:

- resumen de implementación
- archivos modificados
- decisiones técnicas tomadas
- tests ejecutados
- riesgos detectados
- documentación actualizada (si aplica)