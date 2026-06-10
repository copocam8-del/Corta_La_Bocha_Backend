# Corta La Bocha ⚽

## Descripción General

**Corta La Bocha** es una aplicación inspirada en el clásico juego "Tutti Frutti" (Stop), adaptada completamente al universo del fútbol.

Su objetivo es ofrecer una experiencia competitiva y entretenida para fanáticos del fútbol, permitiéndoles demostrar sus conocimientos mediante partidas rápidas, torneos y rankings globales.

Los jugadores deberán completar categorías futbolísticas utilizando una letra aleatoria dentro de un tiempo limitado. Ganará quien obtenga más puntos gracias a respuestas válidas y originales.

---

# Visión del Producto

Crear la plataforma de trivia futbolera más entretenida y competitiva para aficionados al fútbol, combinando conocimiento, velocidad y estrategia en partidas multijugador y contra inteligencia artificial.

---

# Público Objetivo

* Fanáticos del fútbol.
* Jugadores casuales que disfrutan juegos de palabras.
* Amigos que buscan competir entre sí.
* Comunidades futboleras.
* Usuarios que quieran jugar solos contra una IA.

### Rango de edad

* 12 a 60 años.

---

# Propuesta de Valor

* Temática 100% futbolera.
* Partidas rápidas y dinámicas.
* Juego online con amigos.
* Modo solitario contra IA.
* Torneos personalizados.
* Ranking global competitivo.
* Validación automática de respuestas mediante una base de datos futbolística.

---

# Modos de Juego

## 1. Multijugador

Permite jugar contra uno o varios jugadores en tiempo real.

### Características

* Creación de salas.
* Salas públicas.
* Salas privadas.
* Código único de invitación.
* Configuración de tiempo por ronda.
* Configuración de categorías.
* Partidas sincronizadas en tiempo real.

### Flujo

1. Crear sala.
2. Elegir configuración.
3. Compartir código.
4. Los jugadores ingresan.
5. Comienza la partida.
6. Se juegan las rondas.
7. Se calculan los puntos.
8. Se muestra el ganador.

---

## 2. Contra la Máquina

Permite jugar individualmente contra una IA.

### Características

* La IA genera respuestas automáticamente.
* Diferentes niveles de dificultad.
* No requiere otros jugadores.

### Niveles de Dificultad

#### Fácil

* Menor cantidad de respuestas válidas.
* Tiempo de respuesta lento.

#### Medio

* Buen nivel de conocimiento.
* Velocidad equilibrada.

#### Difícil

* Alta precisión.
* Amplio conocimiento futbolístico.

#### Experto

* Máxima precisión.
* Respuestas optimizadas.
* Velocidad superior.

---

# Sistema de Salas

## Salas Públicas

Cualquier usuario puede unirse.

## Salas Privadas

Acceso mediante un código único generado automáticamente.

### Ejemplo

ABC123

### Funcionalidades

* Invitar amigos.
* Control de participantes.
* Configuración personalizada.

---

# Mecánica de Juego

## Selección de Letra

Al comenzar cada ronda, el sistema selecciona una letra aleatoria.

### Ejemplo

M

Todos los jugadores deberán completar las categorías utilizando esa letra.

---

## Temporizador

Opciones disponibles:

* 60 segundos.
* 120 segundos.

### Botón "¡Basta!"

Cuando un jugador completa todas las categorías puede presionar el botón:

**¡BASTA!**

Al hacerlo:

* Se detiene el cronómetro para todos.
* Se bloquean las respuestas.
* Comienza la validación y el cálculo de puntos.

Si nadie presiona el botón:

* La ronda finaliza automáticamente cuando se agota el tiempo.

---

# Sistema de Validación

La aplicación contará con una base de datos futbolística para validar automáticamente las respuestas.

## Entidades Validadas

### Jugadores

* Activos.
* Retirados.
* Históricos.

### Equipos

* Clubes de todas las ligas.

### Selecciones Nacionales

### Directores Técnicos

* Actuales.
* Históricos.

### Estadios

### Clásicos

### Apodos

### Campeones

* Mundial.
* Champions League.
* Copa Libertadores.

### Goleadores Históricos

---

# Sistema de Puntuación

| Situación                               | Puntos |
| --------------------------------------- | ------ |
| Respuesta válida y única                | 20     |
| Respuesta válida diferente a las demás  | 10     |
| Respuesta repetida por varios jugadores | 5      |
| Respuesta inválida o vacía              | 0      |

---

# Temáticas Disponibles

## General

Categorías:

* Jugador.
* Equipo.
* DT.
* Selección.
* Jugador campeón de Champions.
* Jugador campeón del Mundo.
* Jugador argentino.

---

## Liga Argentina

Categorías:

* Jugador argentino.
* Equipo argentino.
* DT argentino.
* Nombre de estadio.
* Apodo de club argentino.
* Jugador histórico argentino.
* Clásico.

---

## Mundial

Categorías:

* Jugador.
* DT.
* Selección.
* Goleador.
* País sede.
* Selección campeona.

---

## Champions League

Categorías:

* Jugador.
* DT.
* Equipo.
* Goleador.
* Jugador histórico.
* Equipo campeón.
* Jugador promesa.
* Clásico.

---

## Copa Libertadores

Categorías:

* Jugador.
* DT.
* Equipo.
* Goleador.
* Jugador histórico.
* Equipo campeón.
* Clásico.

---

# Torneos

Los usuarios podrán crear torneos compuestos por múltiples partidas.

## Características

* Tabla de posiciones.
* Sistema de puntos acumulados.
* Formato liga.
* Eliminación directa (versión futura).
* Campeón final.

### Puntaje del Torneo

| Resultado | Puntos |
| --------- | ------ |
| Victoria  | 3      |
| Empate    | 1      |
| Derrota   | 0      |

---

# Sistema de Usuarios

## Registro

Métodos disponibles:

* Usuario y contraseña.
* Inicio de sesión con Google.

## Perfil de Usuario

Cada jugador tendrá:

* Nombre de usuario.
* Avatar.
* Historial de partidas.
* Estadísticas personales.
* Ranking global.
* Ranking local.
* Logros desbloqueados.

---

# Ranking Global

Clasificación permanente de jugadores.

## Métricas

* Partidas jugadas.
* Partidas ganadas.
* Puntos acumulados.
* Porcentaje de efectividad.
* Racha de victorias.

### Actualización

El ranking se actualiza automáticamente al finalizar cada partida.

---

# Inteligencia Artificial

La IA deberá:

* Generar respuestas válidas.
* Ajustar su comportamiento según la dificultad seleccionada.
* Simular tiempos de respuesta humanos.
* Cometer errores ocasionales en dificultades bajas.
* Utilizar la misma base de conocimiento que los jugadores.

---

# Arquitectura Recomendada

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Shadcn/UI

## Backend

* NestJS
* TypeScript

## Base de Datos

* PostgreSQL

### Tablas Principales

* users
* profiles
* matches
* rounds
* tournaments
* rooms
* rankings
* football_entities
* categories
* answers

## Tiempo Real

* Socket.IO
* WebSockets

### Funciones

* Sincronización de rondas.
* Actualización de puntajes.
* Inicio y finalización de partidas.
* Gestión de salas.
* Torneos en vivo.

## Cache y Rankings

* Redis

## Autenticación

* Auth.js
* Google OAuth

---

# Roadmap MVP

## Fase 1

* Registro e inicio de sesión.
* Modo contra IA.
* Sistema de puntuación.
* Validación automática.
* Ranking básico.

## Fase 2

* Salas privadas.
* Multijugador online.
* WebSockets.

## Fase 3

* Torneos.
* Ranking global.
* Sistema de logros.

## Fase 4

* Aplicación móvil.
* Eventos especiales.
* Monetización.

---

# Monetización (Futuro)

* Avatares premium.
* Temáticas especiales.
* Pase de temporada.
* Cosméticos.
* Estadísticas avanzadas.

---

# Objetivo Final

Convertir a **Corta La Bocha** en la referencia mundial de los juegos de conocimiento futbolístico online, combinando la nostalgia del Tutti Frutti con mecánicas modernas, inteligencia artificial, juego competitivo en tiempo real y una comunidad global de fanáticos del fútbol.
