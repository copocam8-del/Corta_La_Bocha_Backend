import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { AVATAR_IDS, BASE_AVATAR_IDS, CLUB_AVATAR_IDS } from './avatars';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { authValidationPipe } from '../auth/auth-validation.pipe';

describe('avatares', () => {
  it('ids únicos, que entran en profiles.avatar_id (VARCHAR 30) y sólo letras minúsculas, números y _', () => {
    expect(new Set(AVATAR_IDS).size).toBe(AVATAR_IDS.length);
    for (const id of AVATAR_IDS) {
      expect(id.length).toBeLessThanOrEqual(30);
      expect(id).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('se mantienen los avatares clásicos y hay un hincha por camiseta', () => {
    expect(BASE_AVATAR_IDS).toEqual(['pelota', 'camiseta', 'arco', 'trofeo', 'medalla', 'corona', 'escudo', 'estrella', 'bandera', 'rayo', 'fuego', 'botines']);
    expect(CLUB_AVATAR_IDS.length).toBe(29);
    // los repetidos se juntaron: ya no existen sus ids
    for (const id of ['hincha_instituto', 'hincha_union', 'hincha_barracas', 'hincha_colon', 'hincha_huracan']) {
      expect(CLUB_AVATAR_IDS).not.toContain(id);
    }
    expect(CLUB_AVATAR_IDS.every((id) => id.startsWith('hincha_'))).toBe(true);
  });

  it('el perfil acepta sólo ids válidos', async () => {
    const validar = (avatar_id: unknown) => authValidationPipe.transform({ avatar_id }, { type: 'body', metatype: UpdateProfileDto });
    await expect(validar('hincha_boca')).resolves.toBeDefined();
    await expect(validar('hincha_real_madrid')).resolves.toBeDefined();
    await expect(validar('pelota')).resolves.toBeDefined();
    await expect(validar(null)).resolves.toBeDefined(); // sin avatar
    await expect(validar('hincha_inventado')).rejects.toThrow(BadRequestException);
    await expect(validar('hincha_instituto')).rejects.toThrow(BadRequestException); // se juntó con Estudiantes
    await expect(validar('<script>')).rejects.toThrow(BadRequestException);
  });

  // Si el repo del frontend está al lado (como en la compu del equipo), los ids tienen que ser los mismos
  const front = path.resolve(__dirname, '../../../Corta_La_Bocha_Frontend/src/profile/hinchas.ts');
  (fs.existsSync(front) ? it : it.skip)('los ids de los hinchas coinciden con los del frontend', () => {
    const ids = [...fs.readFileSync(front, 'utf8').matchAll(/id: '(hincha_[a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual([...CLUB_AVATAR_IDS]);
  });
});
