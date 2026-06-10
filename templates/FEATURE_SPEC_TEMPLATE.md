# FEATURE_SPEC_TEMPLATE.md
# Especificación Funcional de Feature — Corta La Bocha

---

## 1. Nombre de la feature

`[Nombre de la feature]`

---

## 2. Problema que resuelve

`[Descripción clara del problema que existe hoy y por qué esta feature es necesaria]`

---

## 3. Usuario objetivo

| Actor | Necesidad |
|------|----------|
| `[Jugador / Admin / Sistema / IA]` | `[Qué necesita lograr]` |

---

## 4. Flujo principal

1. `[Paso 1 del usuario o sistema]`
2. `[Paso 2]`
3. `[Paso 3]`
4. `[Resultado final esperado]`

---

## 5. Reglas de negocio

| Regla | Descripción |
|------|------------|
| `[Regla 1]` | `[Regla clara, verificable y backend-owned]` |
| `[Regla 2]` | `[Condición o restricción del sistema]` |

---

## 6. Estados involucrados

| Estado | Descripción |
|--------|------------|
| `[estado_1]` | `[Descripción]` |
| `[estado_2]` | `[Descripción]` |

---

## 7. Permisos

| Acción | Rol permitido | Scope |
|--------|--------------|-------|
| `[acción]` | `[rol]` | `[global / tenant / own]` |

---

## 8. API requerida

| Método | Endpoint | Descripción |
|--------|----------|------------|
| GET | `/api/...` | `[Obtener datos]` |
| POST | `/api/...` | `[Crear acción]` |
| PATCH | `/api/...` | `[Actualizar estado]` |

---

## 9. UI requerida

- `[Pantalla principal]`
- `[Componente clave]`
- `[Estado vacío]`
- `[Estado loading]`
- `[Estado error]`

---

## 10. Auditoría

Eventos obligatorios:

- `[feature].created`
- `[feature].updated`
- `[feature].completed`
- `[error.occurred]` (si aplica)

---

## 11. Notificaciones

- `[Notificación al usuario]`
- `[Notificación al admin o sistema]`

---

## 12. Criterios de aceptación

- La feature funciona end-to-end
- Backend valida todas las reglas
- Frontend solo representa estado
- API está documentada y versionada
- Tests cubren casos felices e inválidos
- Auditoría registrada correctamente
- Respeta multi-tenant si aplica

---

## 13. Fuera de alcance

- Cambios de arquitectura global
- Nuevos dominios sin aprobación
- Lógica de negocio fuera del backend
- Modificaciones no documentadas en RULES.md

---

## 14. Riesgos

- Duplicación de lógica en frontend
- Violación de reglas de negocio
- Inconsistencias en tiempo real (Socket.IO)
- Errores de permisos o tenant isolation
- Dependencias incorrectas entre módulos