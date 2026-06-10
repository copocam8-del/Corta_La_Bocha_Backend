# WORKFLOW.md
# Workflow, Estados y Transiciones — Corta La Bocha

---

## 1. Objetivo

Definir cómo se mueve el sistema, qué estados existen, qué transiciones son válidas y qué reglas gobiernan los procesos.

Este documento evita que la IA o los desarrolladores inventen flujos paralelos fuera de lo especificado.

---

## 2. Entidades con workflow

| Entidad | Tiene estados | Documento fuente |
|----------|--------------|------------------|
| Room | Sí | ARCHITECTURE.md |
| Match | Sí | GAME_RULES.md |
| Round | Sí | GAME_RULES.md |
| Tournament | Sí | GAME_RULES.md |
| User | Sí (parcial) | AUTH_SPEC.md |

---

## 3. Estados permitidos (genérico base)

| Estado | Descripción | Visible para usuario | Estado final |
|--------|-------------|----------------------|--------------|
| draft | Recurso creado pero no activo | No | No |
| active | En ejecución | Sí | No |
| paused | Pausado temporalmente | Sí | No |
| finished | Finalizado correctamente | Sí | Sí |
| cancelled | Cancelado | Sí | Sí |
| archived | Archivado (solo lectura) | No | Sí |

---

## 4. Transiciones permitidas

| Desde | Hacia | Quién puede hacerlo | Validaciones |
|-------|-------|---------------------|--------------|
| draft | active | System / Admin | Validación de configuración completa |
| active | paused | System / Admin | Permiso + motivo opcional |
| paused | active | System / Admin | Verificación de estado consistente |
| active | finished | System / System | Condición de finalización del juego |
| active | cancelled | Admin | Reglas de cancelación |
| finished | archived | System | Proceso automático |

---

## 5. Transiciones prohibidas

| Desde | Hacia | Motivo |
|-------|-------|--------|
| finished | draft | No se reinician entidades cerradas |
| cancelled | active | Requiere recreación de entidad |
| archived | active | Estado final no reversible |
| finished | paused | No tiene sentido de negocio |

---

## 6. Eventos auditables del workflow

Cada transición debe generar auditoría:

- entity.created
- state.changed
- match.started
- match.finished
- round.started
- round.finished
- room.closed
- tournament.finished
- cancellation.requested
- system.auto_transition

---

## 7. Reglas de implementación

- Las transiciones se validan SIEMPRE en backend.
- El frontend solo refleja estados, no decide reglas.
- Toda transición debe pasar por service layer.
- Toda transición relevante genera evento Socket.IO.
- Toda transición se registra en auditoría.
- No se permiten saltos de estado inválidos.
- Los estados deben ser finitos y documentados.

---

## 8. Sprint 0 (relación con workflow)

En Sprint 0 NO se implementan flujos de negocio completos.

Solo se construye:

- infraestructura de estados base
- modelos con campo `status`
- validadores genéricos
- sistema de auditoría base
- soporte para eventos

---

## 9. Definition of Done para un workflow

Un workflow está completo si:

- todas las transiciones están definidas
- backend valida cada cambio de estado
- frontend refleja estados correctamente
- hay auditoría de transiciones
- hay tests de todos los casos:
  - válidos
  - inválidos
- no existen transiciones implícitas
- está documentado en este archivo