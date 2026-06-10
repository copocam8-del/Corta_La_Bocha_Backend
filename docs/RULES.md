# RULES.md
# Constitución del Proyecto — Corta La Bocha

---

Este documento contiene las reglas inviolables del proyecto.  
Todo agente IA y todo desarrollador humano debe obedecerlas.

---

## 1. Reglas de arquitectura

- El backend es el source of truth.
- La lógica de negocio compleja vive en `services`.
- Los serializers validan estructura, no gobiernan el negocio.
- El frontend no decide permisos, puntajes, workflows ni reglas críticas.
- No se crea una carpeta nueva sin actualizar `FOLDER_STRUCTURE.md`.
- No se agrega una dependencia nueva sin justificación formal.
- No se rompe compatibilidad de API sin registrar ADR.
- Toda lógica de juego debe ser determinística en backend.

---

## 2. Reglas de seguridad

- Todo endpoint debe tener permisos explícitos.
- Toda query sensible debe respetar tenant/scope/context.
- Ningún usuario puede acceder a datos fuera de su alcance.
- No se guardan secretos en el repositorio.
- No se hardcodean tokens, claves ni credenciales.
- Toda exportación sensible debe ser auditable.
- Los errores en producción no deben exponer stack traces.
- Nunca confiar en datos enviados por el frontend.

---

## 3. Reglas de frontend

- Usar componentes reutilizables.
- No duplicar lógica de negocio.
- No hardcodear estados si vienen del backend.
- Manejar loading, empty y error states.
- Mantener UI desacoplada de reglas del juego.
- El frontend nunca calcula:
  - puntajes
  - rankings
  - resultados
  - validaciones
- El frontend solo representa estado del servidor.

---

## 4. Reglas de backend

- Toda mutación compleja debe pasar por `services`.
- Toda entidad sensible debe ser auditable.
- Toda transición de estado debe validarse en backend.
- No hacer queries globales sin scope/context/tenant.
- No retornar más datos de los necesarios.
- No calcular reglas del juego en controllers.
- No permitir lógica crítica fuera del backend.
- Toda acción importante debe generar evento de auditoría.

---

## 5. Reglas de API

- Usar nombres consistentes y predecibles.
- Usar formato estándar de error.
- Paginación obligatoria en listados grandes.
- Filtros siempre explícitos.
- Versionar cambios incompatibles.
- No duplicar endpoints con misma responsabilidad.
- Documentar cada endpoint con permisos, inputs y outputs.

---

## 6. Reglas de tiempo real (Socket.IO)

- Todo evento debe ser validado por backend.
- El frontend no puede emitir eventos críticos sin validación.
- El backend es el único que puede:
  - iniciar partidas
  - finalizar rondas
  - calcular scores
  - emitir rankings

- Eventos del cliente nunca modifican estado global directamente.

---

## 7. Reglas de inteligencia artificial (IA)

- La IA no es fuente de verdad.
- El backend siempre tiene prioridad sobre la IA.

### IA puede:
- generar respuestas simuladas
- sugerir validaciones
- actuar como jugador (`ai_player`)

### IA NO puede:
- modificar rankings directamente
- alterar resultados finales
- persistir decisiones sin validación del backend
- sobreescribir estado del juego

---

## 8. Reglas de estado del juego

- El estado de una partida solo puede cambiar en backend.
- Estados válidos:
  - `waiting`
  - `in_progress`
  - `round_active`
  - `finished`

- El frontend nunca fuerza transiciones de estado.
- El servidor es la única fuente de estado oficial.

---

## 9. Reglas anti-desync (multijugador)

- El backend es la única fuente de sincronización.
- El frontend nunca define tiempos oficiales.
- El servidor controla:
  - timers
  - scoring final
  - validación de respuestas
  - resultados

- En conflicto:
  - siempre gana el backend.

---

## 10. Reglas de agentes IA

- Ningún agente puede improvisar arquitectura.
- Ningún agente modifica archivos fuera de su scope.
- Ningún agente elimina código sin explicar impacto.
- Todo cambio debe indicar archivos afectados.
- Todo cambio debe tener criterios de aceptación.
- Si falta información, el agente debe preguntar.
- No se implementan features sin aprobación del flujo.

---

## 11. Reglas de documentación

- Todo módulo nuevo debe documentarse.
- Toda decisión importante debe tener ADR.
- Toda regla de negocio nueva debe agregarse a documentación oficial.
- Toda modificación de estructura debe reflejar `FOLDER_STRUCTURE.md`.
- Toda integración externa debe documentarse en `ARCHITECTURE.md`.

---

## 12. Prohibiciones absolutas

- No lógica de juego en frontend.
- No rankings en cliente.
- No validación de respuestas en cliente.
- No bypass de services.
- No queries sin scope/context.
- No eventos Socket.IO sin validación backend.
- No hardcode de datos futbolísticos.
- No modificar estado global desde cliente.

---

## 13. Regla de oro

> Si un cambio puede afectar seguridad, estado del juego, rankings o consistencia del sistema, debe pasar por backend y ser revisado antes de implementarse.