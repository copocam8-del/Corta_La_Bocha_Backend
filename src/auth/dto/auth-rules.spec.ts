import * as fs from 'fs';
import * as path from 'path';
import { COMMON_PASSWORDS } from './common-passwords';
import { DISPOSABLE_EMAIL_DOMAINS } from './disposable-domains';
import { isCommonPassword, isDisposableEmail, PASSWORD_MAX, PASSWORD_MIN } from './auth-rules';

describe('isCommonPassword', () => {
  it.each(['12345678', 'password', 'PASSWORD', 'Qwerty123', 'contraseña'])('"%s" es común', (p) => {
    expect(isCommonPassword(p)).toBe(true);
  });

  it.each(['gambeta-de-potrero', 'Riquelme_Topo_Gigio_2000'])('"%s" no es común', (p) => {
    expect(isCommonPassword(p)).toBe(false);
  });

  it('la lista tiene unas 1000, en minúsculas, sin repetidas y con el largo permitido', () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(COMMON_PASSWORDS).size).toBe(COMMON_PASSWORDS.length);
    for (const p of COMMON_PASSWORDS) {
      expect(p).toBe(p.toLowerCase());
      expect(p.length).toBeGreaterThanOrEqual(PASSWORD_MIN);
      expect(p.length).toBeLessThanOrEqual(PASSWORD_MAX);
    }
  });
});

describe('isDisposableEmail', () => {
  it.each(['a@mailinator.com', 'a@MAILINATOR.COM', 'a@algo.mailinator.com', 'a@guerrillamail.com'])('%s es descartable', (e) => {
    expect(isDisposableEmail(e)).toBe(true);
  });

  // Que la lista nunca bloquee a los proveedores que usa la gente de verdad
  it.each([
    'gmail.com',
    'googlemail.com',
    'hotmail.com',
    'hotmail.com.ar',
    'outlook.com',
    'outlook.es',
    'live.com',
    'live.com.ar',
    'yahoo.com',
    'yahoo.com.ar',
    'icloud.com',
    'protonmail.com',
    'proton.me',
    'fibertel.com.ar',
    'arnet.com.ar',
    'speedy.com.ar',
  ])('%s NO es descartable', (dominio) => {
    expect(isDisposableEmail(`alguien@${dominio}`)).toBe(false);
  });

  it('la lista tiene dominios con formato válido', () => {
    expect(DISPOSABLE_EMAIL_DOMAINS.length).toBeGreaterThan(1000);
    for (const d of DISPOSABLE_EMAIL_DOMAINS) expect(d).toMatch(/^[a-z0-9.-]+\.[a-z0-9-]+$/);
  });
});

// El frontend tiene una copia de la lista para avisar antes de enviar: tienen que ser iguales
describe('lista de contraseñas comunes del frontend', () => {
  const front = path.resolve(__dirname, '../../../../Corta_La_Bocha_Frontend/src/auth/common-passwords.ts');
  (fs.existsSync(front) ? it : it.skip)('es igual a la del backend', () => {
    const lista = [...fs.readFileSync(front, 'utf8').matchAll(/^ {2}'(.*)',\r?$/gm)].map((m) => m[1]);
    expect(lista).toEqual([...COMMON_PASSWORDS]);
  });
});
