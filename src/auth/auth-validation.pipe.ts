import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

// ValidationPipe sólo para /auth. Devuelve los errores agrupados por campo para que el
// frontend los pueda mostrar debajo de cada input:
// { statusCode: 400, message: 'Datos inválidos', errors: { password: ['...'] } }
export const authValidationPipe = new ValidationPipe({
  whitelist: true, // descarta campos que no estén en el DTO
  transform: true, // aplica los @Transform (ej: email en minúsculas)
  stopAtFirstError: true, // un solo mensaje por campo, el más importante
  exceptionFactory: (validationErrors: ValidationError[]) => {
    const errors: Record<string, string[]> = {};
    for (const err of validationErrors) {
      errors[err.property] = Object.values(err.constraints ?? {});
    }
    return new BadRequestException({ statusCode: 400, message: 'Datos inválidos', errors });
  },
});
