# Kit de Documentación IA-Ready para Vibe Coding Profesional

Este kit convierte una idea de proyecto en un **sistema operativo documental** para trabajar con Claude, agentes IA o equipos de Vibe Coding sin perder arquitectura, reglas ni trazabilidad.

La premisa central es simple:

> La IA acelera el desarrollo, pero si no existe documentación ejecutable, acelera el caos.

## Objetivo

Crear una estructura mínima y escalable para que los agentes IA puedan desarrollar software real respetando:

- arquitectura documentada;
- reglas inviolables;
- stack definido;
- separación de responsabilidades;
- ownership por módulo;
- criterios de seguridad;
- flujo de trabajo ordenado;
- RBAC y multi-tenant desde el diseño;
- API consistente;
- Sprint 0 enfocado en cimientos, no en features.

## Estructura del kit

```txt
project/
├── docs/
│   ├── PROJECT_CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── STACK.md
│   ├── RULES.md
│   ├── FOLDER_STRUCTURE.md
│   ├── WORKFLOW.md
│   ├── RBAC.md
│   ├── API_GUIDELINES.md
│   └── SPRINT_0.md
├── agents/
│   ├── ORCHESTRATOR.md
│   ├── BACKEND_AGENT.md
│   ├── FRONTEND_AGENT.md
│   ├── DEVOPS_AGENT.md
│   ├── SECURITY_AGENT.md
│   └── QA_AGENT.md
├── prompts/
│   ├── MASTER_PROMPT.md
│   └── AGENT_TASK_TEMPLATE.md
├── templates/
│   ├── FEATURE_SPEC_TEMPLATE.md
│   ├── ADR_TEMPLATE.md
│   └── PR_CHECKLIST.md
└── checklists/
    ├── ARCHITECTURE_CHECKLIST.md
    └── RELEASE_READINESS_CHECKLIST.md
```

## Cómo usarlo

1. Completar `docs/PROJECT_CONTEXT.md`.
2. Definir la arquitectura en `docs/ARCHITECTURE.md`.
3. Completar stack y versiones en `docs/STACK.md`.
4. Mantener `docs/RULES.md` como constitución del proyecto.
5. Entregar `agents/ORCHESTRATOR.md` al agente coordinador.
6. Entregar cada archivo de `agents/` al agente correspondiente.
7. No iniciar features hasta completar `docs/SPRINT_0.md`.

## Regla principal

> Ningún agente debe improvisar arquitectura, carpetas, permisos, endpoints, estados ni lógica de negocio fuera de lo definido en estos documentos.
