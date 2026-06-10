# ARCHITECTURE_CHECKLIST.md
# Checklist de Arquitectura Moderna

## Backend Source of Truth

- [ ] El backend controla reglas de negocio.
- [ ] El frontend no decide permisos.
- [ ] El frontend no decide workflow.
- [ ] El frontend no calcula reglas críticas.
- [ ] El backend valida todas las mutaciones.

## Ownership y Multi-tenant

- [ ] Todas las entidades sensibles tienen owner/tenant.
- [ ] Los querysets filtran por tenant.
- [ ] Los reportes respetan tenant.
- [ ] Las exportaciones respetan tenant.
- [ ] Los tests validan aislamiento.

## Audit Trail

- [ ] Login auditable.
- [ ] Cambios de estado auditables.
- [ ] Exportaciones auditables.
- [ ] Cambios de permisos auditables.
- [ ] Acciones críticas auditables.

## Service Layer

- [ ] La lógica compleja vive en services.
- [ ] Los serializers no gobiernan negocio.
- [ ] Las vistas no contienen procesos complejos.
- [ ] Los services tienen tests.
- [ ] Los services son reutilizables.

## API

- [ ] Naming consistente.
- [ ] Errores estándar.
- [ ] Paginación.
- [ ] Filtros.
- [ ] Versionado si corresponde.
- [ ] Documentación.

## Seguridad

- [ ] Permisos explícitos.
- [ ] Scope validado.
- [ ] Rate limiting.
- [ ] Secrets fuera del repo.
- [ ] Uploads validados.
- [ ] Errores seguros.