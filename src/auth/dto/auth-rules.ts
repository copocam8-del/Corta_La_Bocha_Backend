import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { COMMON_PASSWORDS } from './common-passwords';
import { DISPOSABLE_EMAIL_DOMAINS } from './disposable-domains';

// Reglas de registro/login. El frontend repite estas mismas reglas en src/auth/rules.ts
// para avisar antes de enviar, pero la validación que manda es esta.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt ignora lo que pase de 72 bytes
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const NAME_MAX = 50; // nombre y apellido (columnas VARCHAR(50))
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

// Contraseñas de la lista de las más usadas (se compara sin mayúsculas: "PASSWORD" = "password")
export const COMMON_PASSWORD_MESSAGE = 'Esa contraseña es muy común. Elegí otra más difícil de adivinar.';
const COMMON_SET = new Set(COMMON_PASSWORDS);
export const isCommonPassword = (password: string) => COMMON_SET.has(password.toLowerCase());

export function NotCommonPassword(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'notCommonPassword',
      target: object.constructor,
      propertyName,
      options: { message: COMMON_PASSWORD_MESSAGE, ...options },
      validator: { validate: (value: unknown) => typeof value === 'string' && !isCommonPassword(value) },
    });
}

// Mails descartables: se mira el dominio y sus "padres" (x.mailinator.com cuenta como mailinator.com)
export const DISPOSABLE_EMAIL_MESSAGE = 'No aceptamos mails temporales o descartables. Usá tu mail de siempre.';
const DISPOSABLE_SET = new Set(DISPOSABLE_EMAIL_DOMAINS);
export function isDisposableEmail(email: string) {
  const parts = email.trim().toLowerCase().split('@').pop()!.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE_SET.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

export function NotDisposableEmail(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'notDisposableEmail',
      target: object.constructor,
      propertyName,
      options: { message: DISPOSABLE_EMAIL_MESSAGE, ...options },
      validator: { validate: (value: unknown) => typeof value === 'string' && !isDisposableEmail(value) },
    });
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
