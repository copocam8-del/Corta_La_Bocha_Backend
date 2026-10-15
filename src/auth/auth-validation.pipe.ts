import { ArgumentMetadata, BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

const invalid = (errors: Record<string, string[]>) =>
  new BadRequestException({ statusCode: 400, message: 'Datos inválidos', errors });

// ValidationPipe sólo para /auth (y los DTO de los juegos). Devuelve los errores agrupados por campo para que el
// frontend los pueda mostrar debajo de cada input:
// { statusCode: 400, message: 'Datos inválidos', errors: { password: ['...'] } }
class AuthValidationPipe extends ValidationPipe {
  async transform(value: unknown, metadata: ArgumentMetadata) {
    // class-validator sólo revisa objetos: un body que es un array ([]) o un número "pasaba" la validación
    // y llegaba así al servicio (500). Un body siempre tiene que ser un objeto { ... }.
    const esObjeto = typeof value === 'object' && value !== null && !Array.isArray(value);
    if (metadata.type === 'body' && metadata.metatype && metadata.metatype !== Object && !esObjeto) {
      throw invalid({ body: ['Los datos enviados no son válidos'] });
    }
    return super.transform(value, metadata);
  }
}

export const authValidationPipe = new AuthValidationPipe({
  whitelist: true, // descarta campos que no estén en el DTO
  transform: true, // aplica los @Transform (ej: email en minúsculas)
  stopAtFirstError: true, // un solo mensaje por campo, el más importante
  exceptionFactory: (validationErrors: ValidationError[]) => {
    const errors: Record<string, string[]> = {};
    for (const err of validationErrors) {
      errors[err.property] = Object.values(err.constraints ?? {});
    }
    return invalid(errors);
  },
});
