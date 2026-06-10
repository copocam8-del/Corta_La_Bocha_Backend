# STACK.md
# Stack Tecnológico Oficial — Corta La Bocha

---

## 1. Principio

> Ningún agente puede cambiar tecnología, librería principal, framework o patrón de arquitectura sin aprobación del Orchestrator y registro ADR.

---

## 2. Backend

| Componente | Tecnología oficial | Versión / Nota |
|------------|-------------------|----------------|
| Lenguaje | Python | TBD |
| Framework | Django | TBD |
| API | Django REST Framework / Django Ninja | Se define 1 en ADR |
| Autenticación | JWT / Session / OAuth2 / OIDC | TBD |
| Tareas async | Celery | TBD |
| Cache / Broker | Redis | TBD |

---

## 3. Base de Datos

| Componente | Tecnología |
|------------|------------|
| Motor principal | PostgreSQL |
| Migraciones | Django migrations |
| Backups | Definir estrategia (automáticos + snapshots) |
| Multi-tenant | tenant_id (row-level isolation recomendado) |

---

## 4. Frontend

| Componente | Tecnología |
|------------|------------|
| Framework | React |
| Build tool | Vite |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS |
| Estado cliente | Zustand (preferido) |
| Server state | TanStack Query |
| Formularios | React Hook Form |
| Validaciones | Zod |
| Íconos | Lucide React |

---

## 5. DevOps

| Componente | Tecnología |
|------------|------------|
| Contenedores | Docker / Docker Compose |
| Proxy | Nginx |
| SSL | Let's Encrypt |
| CI/CD | GitHub Actions |
| Logs | Docker logs + Sentry (recomendado) |
| Observabilidad | Pendiente (Prometheus / Grafana sugerido) |

---

## 6. Testing

| Capa | Herramienta |
|------|------------|
| Backend unit tests | Pytest + Django TestCase |
| API tests | Pytest + APIClient |
| Frontend tests | Vitest + Testing Library |
| E2E | Playwright |
| Lint | Ruff (backend) / ESLint (frontend) |
| Format | Black / Prettier |

---

## 7. Convenciones de versiones

- Backend y frontend deben versionarse explícitamente.
- Migraciones deben ser reproducibles en cualquier entorno.
- Cambios de API deben ser compatibles o versionados.
- Dependencias críticas siempre con lockfile.
- Actualizaciones mayores requieren ADR obligatorio.

---

## 8. Librerías prohibidas sin autorización

- Librerías abandonadas o sin mantenimiento activo
- Librerías que dupliquen funcionalidades existentes
- Dependencias innecesariamente pesadas en frontend
- Librerías inseguras o sin auditoría mínima
- SDKs externos sin revisión de seguridad

---

## 9. Comandos base

```bash
# Backend
python manage.py migrate
python manage.py runserver
pytest

# Frontend
npm install
npm run dev
npm run build
npm run test

# Docker
docker compose up -d --build
docker compose logs -f