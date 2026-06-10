# RELEASE_READINESS_CHECKLIST.md
# Checklist de Preparación para Release

## Funcional

- [ ] Flujos principales probados.
- [ ] Roles principales probados.
- [ ] Casos de error probados.
- [ ] Estados vacíos revisados.
- [ ] Textos revisados.

## Técnico

- [ ] Build backend OK.
- [ ] Build frontend OK.
- [ ] Migraciones OK.
- [ ] Tests OK.
- [ ] Docker OK.
- [ ] Variables de entorno completas.

## Seguridad

- [ ] DEBUG desactivado.
- [ ] Secrets configurados.
- [ ] Permisos revisados.
- [ ] Endpoints públicos revisados.
- [ ] Rate limiting revisado.
- [ ] Logs sin datos sensibles.

## Datos

- [ ] Backups configurados.
- [ ] Seed inicial si corresponde.
- [ ] Admin creado de forma segura.
- [ ] Migraciones aplicadas.
- [ ] Datos sensibles protegidos.

## Operación

- [ ] Logs visibles.
- [ ] Healthcheck activo.
- [ ] SSL activo.
- [ ] Dominio configurado.
- [ ] Rollback documentado.
- [ ] Soporte inicial definido.

## Documentación

- [ ] README actualizado.
- [ ] API documentada.
- [ ] ADRs actualizados.
- [ ] Guía de despliegue actualizada.
- [ ] Guía de operación básica disponible.