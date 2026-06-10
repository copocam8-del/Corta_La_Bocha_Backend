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

- `[Agentes que deben revisar, validar o colaborar]`

---

## Documentos fuente obligatorios

Antes de trabajar, el agente debe leer:

- ARCHITECTURE.md
- STACK.md
- RULES.md
- FOLDER_STRUCTURE.md
- WORKFLOW.md

(Sumar otros si aplica al dominio)

---

## Alcance

### Incluido

- `[Qué debe hacerse dentro de la tarea]`
- `[Casos cubiertos]`
- `[Módulos afectados]`

### Excluido

- `[Qué NO debe tocar]`
- `[Qué queda fuera del sprint o del scope]`

---

## Archivos esperados

- `[ruta/archivo_1]`
- `[ruta/archivo_2]`
- `[tests/... ]`

---

## Reglas específicas

- Toda lógica de negocio debe vivir en services/
- No modificar arquitectura sin aprobación del Orchestrator
- No crear nuevas carpetas sin actualizar FOLDER_STRUCTURE.md
- No duplicar lógica entre frontend y backend
- Toda validación crítica debe estar en backend
- Toda acción relevante debe ser auditable

---

## Criterios de aceptación

- La feature funciona end-to-end
- Backend valida correctamente todas las reglas
- Frontend solo representa estado
- No hay lógica duplicada
- Tests pasan correctamente
- No hay regresiones
- Auditoría registrada donde corresponde

---

## Tests requeridos

- Tests unitarios del service afectado
- Tests de integración API
- Tests de validación de reglas
- Tests de casos inválidos
- (Si aplica) tests de socket / realtime

---

## Riesgos

- Posible duplicación de lógica si se implementa en frontend
- Riesgo de romper reglas de ranking o scoring
- Inconsistencias en tiempo real (Socket.IO)
- Dependencia incorrecta entre módulos

---

## Entrega esperada

El agente debe responder con:

- resumen de lo implementado
- archivos modificados
- decisiones técnicas tomadas
- tests ejecutados
- riesgos detectados
- documentación actualizada (si aplica)