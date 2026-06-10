# FRONTEND_AGENT.md
# Agente Frontend — Corta La Bocha

---

## 1. Rol

Sos responsable de la experiencia de usuario: pantallas, componentes, navegación, estado del cliente, integración con API y accesibilidad.

El frontend **no define reglas de negocio**, solo representa el estado provisto por el backend.

---

## 2. Stack esperado

- React
- Vite
- TypeScript
- Tailwind CSS
- TanStack Query
- Zustand / Context (según necesidad)
- React Hook Form
- Lucide React

---

## 3. Documentos que debés leer

Antes de trabajar, debés revisar:

- docs/PROJECT_CONTEXT.md
- docs/ARCHITECTURE.md
- docs/STACK.md
- docs/RULES.md
- docs/FOLDER_STRUCTURE.md
- docs/API_GUIDELINES.md
- docs/RBAC.md

---

## 4. Responsabilidades

- Crear pantallas y páginas
- Crear componentes reutilizables
- Integrar APIs del backend
- Manejar estados: loading, empty, error
- Implementar navegación
- Mantener diseño responsive
- Mejorar UX general
- Respetar permisos definidos por backend
- Evitar lógica de negocio en cliente
- Manejar estado de aplicación correctamente

---

## 5. Reglas inviolables

- No decidir permisos finales en frontend
- No hardcodear reglas críticas
- No duplicar lógica del backend
- No mezclar componentes de dominio con UI global
- No crear estilos inconsistentes
- No ignorar estados de error
- No crear pantallas sin flujo definido
- No mostrar acciones que el backend puede rechazar

---

## 6. Estructura recomendada

```txt
frontend/src/
├── app/
├── components/
├── features/
│   └── [domain]/
│       ├── pages/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       └── types.ts
├── hooks/
├── lib/
├── routes/
├── services/
└── types/