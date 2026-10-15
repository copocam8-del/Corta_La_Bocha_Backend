import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

// Límite de intentos POR EMAIL (además del límite por IP de @nestjs/throttler). Frena a quien prueba
// contraseñas contra una misma cuenta cambiando de IP, y a quien llena de mails de recuperación a alguien.
// - login: cuenta sólo los intentos fallidos; uno exitoso limpia el contador.
// - forgot-password: cuenta cada pedido (la respuesta es siempre la misma, no hay "fallido").
// Ventana deslizante de 15 min. Vive en memoria: alcanza con una sola instancia en Render (como el throttler).
// Se cuenta igual exista o no la cuenta, así el 429 no revela qué emails están registrados.
export const EMAIL_MAX_ATTEMPTS = 5;
export const EMAIL_WINDOW_MS = 15 * 60 * 1000;
export const EMAIL_LIMIT_MESSAGE = 'Demasiados intentos con este email. Esperá 15 minutos y probá de nuevo.';
const MAX_KEYS = 50_000; // tope de memoria: si se llena, se limpian las entradas vencidas

export type AttemptKind = 'login' | 'forgot';

@Injectable()
export class EmailAttemptLimiter {
  private readonly attempts = new Map<string, number[]>();
  now = () => Date.now(); // se reemplaza en los tests

  // Tira 429 si ese email ya usó sus intentos en la ventana
  check(kind: AttemptKind, email: string) {
    if (this.recent(this.key(kind, email)).length >= EMAIL_MAX_ATTEMPTS) {
      throw new HttpException({ statusCode: 429, message: EMAIL_LIMIT_MESSAGE }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  fail(kind: AttemptKind, email: string) {
    const key = this.key(kind, email);
    const list = this.recent(key);
    list.push(this.now());
    this.attempts.set(key, list);
    if (this.attempts.size > MAX_KEYS) this.sweep();
  }

  clear(kind: AttemptKind, email: string) {
    this.attempts.delete(this.key(kind, email));
  }

  private key(kind: AttemptKind, email: string) {
    return `${kind}:${String(email ?? '').trim().toLowerCase()}`;
  }

  private recent(key: string) {
    const since = this.now() - EMAIL_WINDOW_MS;
    return (this.attempts.get(key) ?? []).filter((t) => t > since);
  }

  private sweep() {
    for (const key of [...this.attempts.keys()]) {
      const list = this.recent(key);
      if (list.length) this.attempts.set(key, list);
      else this.attempts.delete(key);
    }
  }
}
