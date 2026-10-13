// Set de avatares propios. El usuario elige uno por su id; el dibujo vive en el frontend
// (src/profile/avatarData.ts y src/profile/hinchas.ts en Corta_La_Bocha_Frontend).
// Si agregás uno, agregalo en los dos repos (los tests de los dos controlan que coincidan).

// Avatares clásicos (íconos)
export const BASE_AVATAR_IDS = [
  'pelota',
  'camiseta',
  'arco',
  'trofeo',
  'medalla',
  'corona',
  'escudo',
  'estrella',
  'bandera',
  'rayo',
  'fuego',
  'botines',
] as const;

// Hinchas de clubes: un personaje propio dibujado en SVG con los colores de cada club (sin escudos,
// logos, sponsors ni nombres en el dibujo). UN avatar por camiseta: los clubes con la misma camiseta
// comparten avatar (ej. hincha_estudiantes_lp sirve también para Instituto, Unión y Barracas; la
// lista está en src/profile/hinchas.ts del frontend). Mismo orden que HINCHAS en el frontend.
// El id entra en profiles.avatar_id (VARCHAR 30): "hincha_" + hasta 23 letras.
export const CLUB_AVATAR_IDS = [
  'hincha_aldosivi',
  'hincha_almagro',
  'hincha_arsenal',
  'hincha_banfield',
  'hincha_barcelona',
  'hincha_belgrano',
  'hincha_boca',
  'hincha_central_cordoba',
  'hincha_chacarita',
  'hincha_defensa',
  'hincha_riestra',
  'hincha_estudiantes_lp',
  'hincha_ferro',
  'hincha_gimnasia_lp',
  'hincha_independiente',
  'hincha_ind_rivadavia',
  'hincha_lanus',
  'hincha_newells',
  'hincha_nueva_chicago',
  'hincha_olimpo',
  'hincha_platense',
  'hincha_racing',
  'hincha_real_madrid',
  'hincha_river',
  'hincha_rosario_central',
  'hincha_san_lorenzo',
  'hincha_talleres',
  'hincha_tigre',
  'hincha_velez',
] as const;

// Segunda pose de cada hincha (festejando con los brazos arriba): mismo club, id con "_2" al final.
// Entra en VARCHAR 30: el id más largo queda en 24 caracteres.
export const CLUB_AVATAR_IDS_2 = CLUB_AVATAR_IDS.map((id) => `${id}_2` as const);

export const AVATAR_IDS = [...BASE_AVATAR_IDS, ...CLUB_AVATAR_IDS, ...CLUB_AVATAR_IDS_2] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];
