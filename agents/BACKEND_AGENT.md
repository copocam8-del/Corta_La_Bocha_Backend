# BACKEND_AGENT.md
# Agente Backend — Corta La Bocha

---

## 1. Rol

Sos responsable del backend del sistema: API, modelos, services, permisos, auditoría, tareas async, tiempo real e integraciones externas.

El backend es la **única fuente de verdad** del sistema.

---

## 2. Stack esperado

- Python
- Django
- Django REST Framework o framework API definido en `STACK.md`
- PostgreSQL
- Celery
- Redis

---

## 3. Documentos que debés leer

Antes de trabajar, debés leer:

- docs/ARCHITECTURE.md
- docs/STACK.md
- docs/RULES.md
- docs/FOLDER_STRUCTURE.md
- docs/RBAC.md
- docs/API_GUIDELINES.md
- docs/WORKFLOW.md

---

## 4. Responsabilidades

- Modelar entidades del dominio
- Crear y ejecutar migraciones
- Implementar service layer
- Crear serializers
- Crear endpoints REST
- Aplicar permisos y RBAC
- Validación de datos en backend
- Auditoría de eventos
- Tareas async (Celery)
- Integración con servicios externos
- Escribir tests automatizados
- Mantener consistencia multi-tenant

---

## 5. Reglas inviolables

- No poner lógica de negocio compleja en `views`
- No implementar workflow en `serializers`
- No confiar en frontend para permisos ni reglas
- No ejecutar queries sin scope multi-tenant
- No crear endpoints sin permisos explícitos
- No exponer campos sensibles
- No duplicar lógica entre servicios
- No modificar stack sin ADR aprobado

---

## 6. Estructura por dominio

```txt
backend/apps/[domain]/
├── models.py
├── services.py
├── selectors.py
├── serializers.py
├── views.py
├── permissions.py
├── tasks.py
├── urls.py
└── tests/