import { registerDecorator, ValidationOptions } from 'class-validator';
import { contieneOfensivo, MENSAJE_USUARIO, usuarioPermitido } from './filtro';

// Decoradores de class-validator para los DTO (registro y perfil). Van ARRIBA de todo en la propiedad: los
// decoradores se evalúan de abajo hacia arriba, así primero se revisan vacío, tipo y largo.
// Lo que no es texto lo deja pasar: de eso se encargan IsString / IsOptional.

// Nombre de usuario: ni ofensivo ni reservado (admin, moderador, clb…)
export function UsuarioPermitido(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'usuarioPermitido',
      target: object.constructor,
      propertyName,
      options: { message: MENSAJE_USUARIO, ...options },
      validator: { validate: (value: unknown) => typeof value !== 'string' || usuarioPermitido(value) },
    });
}

// Cualquier texto que ven otros usuarios: sin malas palabras
export function TextoPermitido(message: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'textoPermitido',
      target: object.constructor,
      propertyName,
      options: { message, ...options },
      validator: { validate: (value: unknown) => typeof value !== 'string' || !contieneOfensivo(value) },
    });
}
