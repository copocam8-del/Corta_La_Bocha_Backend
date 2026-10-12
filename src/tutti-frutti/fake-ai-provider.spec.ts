import { ConfigService } from '@nestjs/config';
import { createAiProvider } from './ai-providers';
import { fakeLookup, FakeAiProvider } from './fake-ai-provider';
import { TuttiFruttiValidatorService } from './tutti-frutti.service';

describe('modo de prueba AI_PROVIDER=fake', () => {
  it('nunca se permite en producción', () => {
    expect(createAiProvider({ provider: 'fake', keys: {}, nodeEnv: 'production' })).toMatchObject({
      ok: false,
      problem: expect.stringContaining('no se permite en producción'),
    });
    const v = new TuttiFruttiValidatorService(new ConfigService({ AI_PROVIDER: 'fake', NODE_ENV: 'production' }));
    expect(v.providerInfo).toBeNull();
  });

  it('fuera de producción no necesita clave', () => {
    const v = new TuttiFruttiValidatorService(new ConfigService({ AI_PROVIDER: 'fake', NODE_ENV: 'development' }));
    expect(v.providerInfo).toEqual({ name: 'fake', model: 'banco-fijo' });
  });

  it('busca en el banco de la categoría: exacto (sin tildes) o por apellido', () => {
    expect(fakeLookup('Jugador', 'messi')).toBe('Messi');
    expect(fakeLookup('Jugador', 'Lionel Messi')).toBe('Lionel Messi'); // está en los extra
    expect(fakeLookup('Jugador', 'Leo Messi')).toBe('Messi'); // por apellido
    expect(fakeLookup('Estadio', 'nuevo gasometro')).toBe('Nuevo Gasómetro');
    expect(fakeLookup('Estadio', 'Messi')).toBeNull(); // otra categoría
    expect(fakeLookup('Jugador', 'Mesa')).toBeNull();
    expect(fakeLookup('Jugador', 'Di')).toBeNull();
  });

  it('valida una ronda completa con el mismo flujo que la IA real (reglas en código + "IA")', async () => {
    const v = new TuttiFruttiValidatorService(
      new ConfigService({ AI_PROVIDER: 'fake', NODE_ENV: 'test', AI_FAKE_DELAY_MS: '0' }),
    );
    const res = await v.validateAnswers('M', [
      { key: 'a', category: 'Jugador', answer: 'Messi' },
      { key: 'b', category: 'Jugador', answer: 'Mesa' },
      { key: 'c', category: 'Jugador', answer: 'Riquelme' }, // no empieza con M: lo frena el código
      { key: 'd', category: 'Jugador', answer: '' },
    ]);
    expect(res.get('a')).toMatchObject({ status: 'valid', canonical: 'Messi' });
    expect(res.get('b')).toMatchObject({ status: 'invalid' });
    expect(res.get('c')).toMatchObject({ status: 'invalid', reason: 'No empieza con la letra M.' });
    expect(res.get('d')).toMatchObject({ status: 'empty' });
  });

  it('devuelve el JSON con el mismo formato que los proveedores reales', async () => {
    const out = JSON.parse(
      await new FakeAiProvider(0).completeJson({
        system: '',
        schemaName: 'x',
        schema: {},
        timeoutMs: 1000,
        userJson: JSON.stringify({ letra: 'B', respuestas: [{ id: '1', categoria: 'Equipo', respuesta: 'Boca Juniors' }] }),
      }),
    );
    expect(out).toEqual({ results: [{ id: '1', isValid: true, canonical: 'Boca Juniors', reason: 'Válida (modo de prueba).' }] });
  });
});
