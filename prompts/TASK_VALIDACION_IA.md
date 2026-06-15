# Tarea

**Implementación de Validación de Respuestas del Tutti Frutti mediante IA en Backend**

---

## Contexto

El juego actual "Corta La Bocha" requiere validar de forma dinámica e inteligente las respuestas que el usuario introduce en la pantalla del juego (`/game`) al finalizar el tiempo (image_83cf04.jpg). Como las categorías son futboleras (Jugador, Equipo, DT, Selección, Campeón Champions, Campeón Mundial, Jugador Argentino) (image_83cf04.jpg), usar una base de datos estática dejaría afuera respuestas válidas pero poco comunes. Se requiere delegar la validación crítica a un modelo de lenguaje (LLM) que actúe como árbitro experto y devuelva un formato JSON estructurado para calcular los puntajes de la ronda en el servidor.

---

## Agente responsable

- Backend Agent

---

## Agentes secundarios

- Orchestrator
- QA Agent

---

## Documentos fuente obligatorios

Antes de trabajar, el agente debe leer:

- ARCHITECTURE.md
- STACK.md
- RULES.md
- FOLDER_STRUCTURE.md
- WORKFLOW.md

---

## Alcance

### Incluido

- Creación de un servicio en NestJS (`TuttiFruttiValidatorService`) dentro de `src/` que se conecte con la API de la IA elegida (ej. Gemini API o OpenAI API) (image_83c7c5.jpg).
- Implementación de un prompt estructurado que fuerce al modelo a responder estrictamente en formato JSON con la validez de cada campo y su correspondiente motivo si es inválido.
- Lógica de negocio en el servicio para calcular los puntajes finales de la ronda cruzando los resultados aprobados del usuario contra las respuestas de la IA (Regla: 10 pts si responde solo/diferente, 5 pts si empata respuesta con la IA, 0 pts si es inválido o quedó vacío).
- Creación de un endpoint de tipo `POST` en el controlador correspondiente para recibir la letra de la ronda y el objeto con las respuestas del frontend (image_83c7c5.jpg).

### Excluido

- No se debe modificar la lógica visual del Frontend (eso queda para el Frontend Agent).
- No se deben alterar los esquemas de autenticación existentes de los módulos `src/auth` y `src/users` (image_83c7c5.jpg).

---

## Archivos esperados

- `src/tutti-frutti/tutti-frutti.service.ts`
- `src/tutti-frutti/tutti-frutti.controller.ts`
- `src/tutti-frutti/dto/validate-round.dto.ts`
- `test/tutti-frutti.e2e-spec.ts`

---

## Reglas específicas

- Toda lógica de negocio debe vivir en services/
- La respuesta del LLM debe ser parseada de forma segura; en caso de fallo del proveedor de IA, se debe contemplar un mecanismo de fallback para no romper la partida.
- Toda validación crítica debe estar en backend.
- Las credenciales de la API de la IA deben consumirse estrictamente desde variables de entorno a través de `.env` (image_83c787.jpg), nunca hardcodeadas.

---

## Criterios de aceptación

- El backend expone un endpoint funcional que recibe las respuestas de la pantalla `/game` (image_83cf04.jpg) y devuelve los puntajes detallados desglosados por categoría.
- La IA clasifica correctamente si una entidad pertenece al fútbol real, si cumple la regla de la letra de la ronda y su condición específica (ej. validar si el DT realmente fue Campeón Mundial).
- El formato de respuesta de la API es un JSON limpio procesable por el frontend.
- Los tests de integración pasan correctamente sin generar regresiones en el módulo de base de datos con Prisma (image_83c7c5.jpg).

---

## Tests requeridos

- Tests unitarios del service afectado para la validación matemática del cálculo de puntos (10, 5, 0).
- Tests de integración API simulando un request `POST` exitoso.
- Tests de casos inválidos cuando el input contiene campos vacíos o nulos.

---

## Riesgos

- Latencia de la API del LLM: La llamada externa a la IA puede demorar unos segundos; se debe asegurar que el frontend maneje un estado de carga limpio (image_83cf04.jpg).
- Inconsistencia en el formato del JSON de salida: Se requiere forzar el modo JSON (Structured Outputs) nativo del proveedor de IA para evitar texto complementario.

---

## Entrega esperada

El agente debe responder con:

- resumen de lo implementado
- archivos modificados
- decisiones técnicas tomadas
- tests ejecutados
- riesgos detectados
- documentación actualizada (si aplica)