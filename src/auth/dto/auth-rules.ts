import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';

// Reglas de registro/login. El frontend repite estas mismas reglas en src/auth/rules.ts
// para avisar antes de enviar, pero la validación que manda es esta.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt ignora lo que pase de 72 bytes
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const MIN_AGE = 13;

// Emails siempre en minúsculas y sin espacios: "Juan@Mail.com " === "juan@mail.com"
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

// Para campos opcionales: saca espacios y trata "" como "no enviado" (el formulario manda "" si se deja vacío)
export const TrimOrUndefined = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

export function ageFrom(birthDate: string, today = new Date()): number {
  const birth = new Date(birthDate);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function MinAge(years: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'minAge',
      target: object.constructor,
      propertyName,
      constraints: [years],
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && !isNaN(Date.parse(value)) && ageFrom(value) >= years,
      },
    });
}
