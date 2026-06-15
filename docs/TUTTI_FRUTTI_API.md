# API de Validación Tutti Frutti con IA

## Descripción General

El módulo `TuttiFrutti` valida las respuestas del juego "Corta La Bocha" utilizando IA (OpenAI API) para determinar si son válidas dentro de las reglas del juego.

---

## Endpoint

### POST `/tutti-frutti/validate-round`

Valida todas las respuestas de una ronda del juego y calcula los puntos obtenidos.

---

## Request

### Headers
```http
Content-Type: application/json
```

### Body

```typescript
{
  roundLetter: string;        // Letra de la ronda (A-Z, uppercase)
  answers: {
    category: string;         // Categoría del juego
    answer: string | null;    // Respuesta del usuario (puede ser null o vacío)
  }[];
  matchId?: string;           // (Opcional) ID de la partida
}
```

### Categorías Válidas

```
- "Jugador"
- "Equipo"
- "DT"
- "Selección"
- "Campeón Champions"
- "Campeón Mundial"
- "Jugador Argentino"
```

### Ejemplo de Request

```bash
curl -X POST http://localhost:3000/tutti-frutti/validate-round \
  -H "Content-Type: application/json" \
  -d '{
    "roundLetter": "M",
    "answers": [
      { "category": "Jugador", "answer": "Messi" },
      { "category": "Equipo", "answer": "Manchester City" },
      { "category": "DT", "answer": "Pep Guardiola" },
      { "category": "Selección", "answer": "México" },
      { "category": "Campeón Champions", "answer": "Manchester United" },
      { "category": "Campeón Mundial", "answer": "" },
      { "category": "Jugador Argentino", "answer": "Mascherano" }
    ],
    "matchId": "match-123"
  }'
```

---

## Response

### Success (200 OK)

```typescript
{
  roundLetter: string;
  totalPoints: number;
  results: [
    {
      category: string;
      userAnswer: string | null;
      aiAnswer: string | null;
      isValid: boolean;
      reason: string;
      points: number;
    }
  ];
  timestamp: string;  // ISO 8601 format
}
```

### Ejemplo de Response

```json
{
  "roundLetter": "M",
  "totalPoints": 35,
  "results": [
    {
      "category": "Jugador",
      "userAnswer": "Messi",
      "aiAnswer": "Messi",
      "isValid": true,
      "reason": "Valid Argentine footballer",
      "points": 5
    },
    {
      "category": "Equipo",
      "userAnswer": "Manchester City",
      "aiAnswer": "Manchester City",
      "isValid": true,
      "reason": "Valid professional football club",
      "points": 5
    },
    {
      "category": "DT",
      "userAnswer": "Pep Guardiola",
      "aiAnswer": "Pep Guardiola",
      "isValid": true,
      "reason": "Valid football manager",
      "points": 5
    },
    {
      "category": "Selección",
      "userAnswer": "México",
      "aiAnswer": "México",
      "isValid": true,
      "reason": "Valid national team",
      "points": 5
    },
    {
      "category": "Campeón Champions",
      "userAnswer": "Manchester United",
      "aiAnswer": "Manchester City",
      "isValid": false,
      "reason": "Manchester United won Champions League but not recently for M letter verification",
      "points": 0
    },
    {
      "category": "Campeón Mundial",
      "userAnswer": null,
      "aiAnswer": null,
      "isValid": false,
      "reason": "Empty answer",
      "points": 0
    },
    {
      "category": "Jugador Argentino",
      "userAnswer": "Mascherano",
      "aiAnswer": "Mascherano",
      "isValid": true,
      "reason": "Valid Argentine footballer",
      "points": 10
    }
  ],
  "timestamp": "2026-06-15T14:30:45.123Z"
}
```

---

## Códigos de Error

### 400 Bad Request

Cuando la entrada es inválida:

```json
{
  "statusCode": 400,
  "message": "Invalid round letter. Must be a single uppercase letter.",
  "error": "Bad Request"
}
```

Causas:
- `roundLetter` no es una letra uppercase (A-Z)
- `answers` contiene una categoría no válida
- `answers` no es un array
- Estructura de DTO incorrecta

### 500 Internal Server Error

```json
{
  "statusCode": 500,
  "message": "Failed to validate with AI",
  "error": "Internal Server Error"
}
```

Causas:
- Error en la API de OpenAI
- Error al parsear respuesta de IA
- Problema en el servidor

**Nota**: Si OpenAI falla, el sistema activa fallback mode automáticamente (validación básica).

---

## Sistema de Puntos

### Reglas de Puntuación

| Puntos | Condición | Descripción |
|--------|-----------|------------|
| **10** | Válido + Único | La respuesta es válida y diferente de la sugerencia de IA |
| **5** | Válido + Coincide | La respuesta es válida e idéntica a la sugerencia de IA |
| **0** | Inválido | La respuesta no es válida o está vacía |

### Validaciones de la IA

La IA valida que la respuesta:

1. **Empiece con la letra correcta** (ej. "M" para ronda "M")
2. **Sea una entidad real de fútbol** (jugador, equipo, etc. que exista realmente)
3. **Cumpla con la categoría específica**:
   - `Jugador`: Debe ser un futbolista profesional
   - `Equipo`: Debe ser un club de fútbol real
   - `DT`: Debe ser un director técnico/manager real
   - `Selección`: Debe ser una selección nacional
   - `Campeón Champions`: Debe haber ganado la UEFA Champions League
   - `Campeón Mundial`: Debe haber ganado la FIFA World Cup
   - `Jugador Argentino`: Debe ser de nacionalidad argentina

---

## Integración con Frontend

### TypeScript (Client-side)

```typescript
interface ValidateRoundRequest {
  roundLetter: string;
  answers: { category: string; answer: string | null }[];
  matchId?: string;
}

interface ValidationResult {
  category: string;
  userAnswer: string | null;
  aiAnswer: string | null;
  isValid: boolean;
  reason: string;
  points: number;
}

interface ValidateRoundResponse {
  roundLetter: string;
  totalPoints: number;
  results: ValidationResult[];
  timestamp: string;
}

async function validateRound(dto: ValidateRoundRequest): Promise<ValidateRoundResponse> {
  const response = await fetch('/tutti-frutti/validate-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return response.json();
}
```

### Estados del Frontend

1. **Validating**: Mostrar spinner mientras se valida
2. **Success**: Mostrar tabla de resultados con puntos
3. **Error**: Mostrar mensaje de error y opción de reintentar

---

## Configuración

### Variables de Entorno

```env
# Requerido
OPENAI_API_KEY=sk-...

# Opcional (defaults existentes)
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://...
```

### Modelos de IA Soportados

- `gpt-4o-mini` (actual, recomendado por cost/benefit)
- `gpt-4o` (más preciso pero más caro)
- `gpt-3.5-turbo` (más rápido pero menos preciso)

Para cambiar, editar `tutti-frutti.service.ts` línea ~127.

---

## Fallback Mode

Si `OPENAI_API_KEY` no está configurada o la API falla:

- **Validación básica**: Solo verifica que la respuesta empiece con la letra correcta
- **Puntos**: 5 puntos si pasa, 0 si no
- **Log**: Se registra en `logger.warn()`
- **Transparencia**: Respuesta sigue el mismo formato

Ejemplo fallback:
```json
{
  "category": "Jugador",
  "userAnswer": "Messi",
  "aiAnswer": "Messi",
  "isValid": true,
  "reason": "Validated with fallback rules (AI unavailable)",
  "points": 5
}
```

---

## Limitaciones y Consideraciones

### Latencia
- Esperado: 1-3 segundos por ronda (7 categorías)
- Frontend debe mostrar loading state
- Timeout recomendado: 10 segundos

### Costos
- Cada ronda = ~1-2 llamadas a OpenAI
- Estimado: $0.01-0.05 USD por ronda
- Considera implementar caché para respuestas comunes

### Precisión
- IA es >95% precisa en validaciones básicas
- Puede tener errores con:
  - Nombres alternativos (ej. "Ronaldinho" vs "Ronaldinho Gaúcho")
  - Entidades muy nuevas o muy antiguas
  - Ambigüedades en español

### Seguridad
- API key almacenada SOLO en servidor
- Nunca exponerla en cliente
- Usar HTTPS en producción
- Implementar rate limiting

---

## Ejemplos de Respuestas Válidas/Inválidas

### Válidas (10 puntos)
```
Ronda "R": "Ronaldinho" (Jugador)
Ronda "B": "Barcelona" (Equipo)
Ronda "C": "Carlo Ancelotti" (DT)
```

### Válidas pero coinciden con IA (5 puntos)
```
Ronda "M": "Messi" (Jugador, IA sugiere "Messi")
```

### Inválidas (0 puntos)
```
Ronda "M": "Benzema" (no empieza con M)
Ronda "J": "" (vacío)
Ronda "P": "PlayStatio" (no es entidad real)
```

---

## Debugging

### Ver logs en desarrollo

```bash
npm run start:dev
```

Buscar mensajes con `[TuttiFruttiValidatorService]`

### Testear localmente

```bash
npm test -- tutti-frutti
npm run test:e2e -- tutti-frutti
```

### Ejemplo con curl

```bash
curl -X POST http://localhost:3000/tutti-frutti/validate-round \
  -H "Content-Type: application/json" \
  -d '{"roundLetter":"A","answers":[{"category":"Jugador","answer":"Aguero"}]}'
```

---

## Roadmap Futuro

- [ ] Caché de respuestas comunes
- [ ] Batch validation (múltiples rondas)
- [ ] Webhook para validaciones async
- [ ] Auditoría de decisiones de IA
- [ ] Dashboard de estadísticas
- [ ] Soporte para múltiples idiomas
- [ ] Integración con base de datos de fútbol real (FIFA, UEFA)
