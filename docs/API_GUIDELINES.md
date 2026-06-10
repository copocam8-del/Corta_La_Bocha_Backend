# API_GUIDELINES.md

# Guía de Diseño de APIs – Corta La Bocha ⚽

---

# 1. Principio

Las APIs de Corta La Bocha deben ser:

* consistentes
* predecibles
* seguras
* escalables
* documentadas
* orientadas a tiempo real

El backend es la única fuente de verdad para:

* puntajes
* validación de respuestas
* rankings
* torneos
* resultados
* estado de partidas

---

# 2. Convenciones de Naming

## Correcto

```txt id="n1"
GET /api/users
GET /api/rooms
GET /api/matches
GET /api/rounds
GET /api/tournaments
GET /api/rankings
GET /api/categories
GET /api/answers
GET /api/achievements
```

## Incorrecto

```txt id="n2"
POST /api/startGame
POST /api/doStuff
POST /api/processAnswers
```

---

# 3. Métodos HTTP

| Método | Uso                   |
| ------ | --------------------- |
| GET    | lectura               |
| POST   | creación / acción     |
| PUT    | reemplazo             |
| PATCH  | actualización parcial |
| DELETE | eliminación lógica    |

---

# 4. Acciones de Dominio

## Salas

```txt id="a1"
POST /api/rooms/{id}/join
POST /api/rooms/{id}/leave
POST /api/rooms/{id}/start
POST /api/rooms/{id}/close
```

## Partidas

```txt id="a2"
POST /api/matches/{id}/finish
POST /api/matches/{id}/surrender
```

## Rondas

```txt id="a3"
POST /api/rounds/{id}/submit
POST /api/rounds/{id}/basta
```

## Torneos

```txt id="a4"
POST /api/tournaments/{id}/join
POST /api/tournaments/{id}/start
POST /api/tournaments/{id}/finish
```

---

# 5. Recursos Principales

## Usuarios

```txt id="r1"
GET /api/users
GET /api/users/{id}
PATCH /api/users/{id}
```

## Perfil

```txt id="r2"
GET /api/profiles/me
PATCH /api/profiles/me
```

## Salas

```txt id="r3"
GET /api/rooms
POST /api/rooms
GET /api/rooms/{id}
PATCH /api/rooms/{id}
DELETE /api/rooms/{id}
```

## Partidas

```txt id="r4"
GET /api/matches
GET /api/matches/{id}
POST /api/matches
```

## Rondas

```txt id="r5"
GET /api/rounds/{id}
POST /api/rounds/{id}/submit
POST /api/rounds/{id}/basta
```

## Torneos

```txt id="r6"
GET /api/tournaments
POST /api/tournaments
GET /api/tournaments/{id}
```

## Rankings

```txt id="r7"
GET /api/rankings/global
GET /api/rankings/weekly
GET /api/rankings/monthly
```

---

# 6. Paginación

Formato estándar:

```json id="p1"
{
  "count": 120,
  "next": "/api/rankings?page=2",
  "previous": null,
  "results": []
}
```

---

# 7. Filtros

Ejemplos:

```txt id="f1"
/api/rankings/global?country=AR
/api/matches?player_id=123
/api/tournaments?status=active
/api/rooms?visibility=public
```

---

# 8. Errores

```json id="e1"
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "No se pudo validar la respuesta.",
    "details": {
      "answer": ["La respuesta no existe en la base de datos."]
    }
  }
}
```

---

## Códigos

### Auth

```txt id="e2"
UNAUTHORIZED
TOKEN_EXPIRED
INVALID_CREDENTIALS
```

### Juego

```txt id="e3"
MATCH_NOT_FOUND
ROOM_NOT_FOUND
ROUND_FINISHED
INVALID_ANSWER
PLAYER_NOT_IN_ROOM
TIME_EXPIRED
```

---

# 9. Versionado

```txt id="v1"
/api/v1/rooms
/api/v1/matches
/api/v2/rooms
```

---

# 10. Seguridad

* autenticación obligatoria en endpoints privados
* validación de ownership
* no confiar en frontend
* puntaje solo backend
* respuestas solo backend
* rate limiting
* anti spam de rooms
* anti abuse ranking

---

# 11. WebSockets (TIEMPO REAL)

## ⚠️ IMPORTANTE

Corta La Bocha NO usa Socket.IO.

Usa:

* Django Channels
* WebSockets
* Redis

---

## Eventos Cliente → Servidor

```txt id="ws1"
room_join
room_leave
match_ready
round_submit
round_basta
```

---

## Eventos Servidor → Cliente

```txt id="ws2"
room_updated
match_started
match_finished
round_started
round_finished
score_updated
ranking_updated
```

---

# 12. Respuestas estándar

## OK

```json id="ok1"
{
  "success": true,
  "data": {}
}
```

## Mensaje

```json id="ok2"
{
  "success": true,
  "message": "Operación realizada correctamente."
}
```

---

# 13. Auditoría

Eventos:

```txt id="audit"
user_registered
user_login
room_created
room_joined
match_started
match_finished
round_started
round_finished
answer_submitted
answer_validated
ranking_updated
```

---

# 14. Checklist

* ¿ya existe endpoint similar?
* ¿respeta REST?
* ¿tiene auth?
* ¿tiene permisos?
* ¿está documentado?
* ¿tiene validaciones?
* ¿tiene tests?
* ¿genera auditoría?
* ¿usa WebSockets correctamente?
* ¿respeta backend source of truth?

---

# 🎯 Objetivo Final

Diseñar APIs:

* claras
* seguras
* escalables
* consistentes
* en tiempo real
* preparadas para SaaS global
