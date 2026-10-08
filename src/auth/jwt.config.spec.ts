import { ConfigService } from '@nestjs/config';
import { getJwtConfig } from './jwt.config';

const configCon = (vars: Record<string, string>) => new ConfigService(vars);

describe('getJwtConfig', () => {
  it('usa JWT_SECRET y JWT_EXPIRATION cuando están definidos', () => {
    expect(getJwtConfig(configCon({ JWT_SECRET: 's3cr3to', JWT_EXPIRATION: '2h' }))).toEqual({
      secret: 's3cr3to',
      expiresIn: '2h',
    });
  });

  it('vence a los 7 días si no hay JWT_EXPIRATION', () => {
    expect(getJwtConfig(configCon({ JWT_SECRET: 's3cr3to' })).expiresIn).toBe('7d');
  });

  it('en producción no arranca sin JWT_SECRET', () => {
    expect(() => getJwtConfig(configCon({ NODE_ENV: 'production' }))).toThrow(/JWT_SECRET/);
  });

  it('en desarrollo usa un secreto de desarrollo', () => {
    expect(getJwtConfig(configCon({ NODE_ENV: 'development' })).secret).toBeTruthy();
  });
});
