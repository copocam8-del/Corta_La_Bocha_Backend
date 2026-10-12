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
// logos, sponsors ni nombres en el dibujo). Mismo orden que CLUBES en el frontend (alfabético).
// El id entra en profiles.avatar_id (VARCHAR 30): "hincha_" + hasta 23 letras.
export const CLUB_AVATAR_IDS = [
  'hincha_aldosivi',
  'hincha_all_boys',
  'hincha_almagro',
  'hincha_argentinos',
  'hincha_arsenal',
  'hincha_atlanta',
  'hincha_atl_tucuman',
  'hincha_banfield',
  'hincha_barcelona',
  'hincha_barracas',
  'hincha_belgrano',
  'hincha_boca',
  'hincha_central_cordoba',
  'hincha_chacarita',
  'hincha_colon',
  'hincha_defensa',
  'hincha_riestra',
  'hincha_estudiantes_lp',
  'hincha_estudiantes_rc',
  'hincha_ferro',
  'hincha_gimnasia_lp',
  'hincha_gimnasia_mza',
  'hincha_godoy_cruz',
  'hincha_huracan',
  'hincha_independiente',
  'hincha_ind_rivadavia',
  'hincha_instituto',
  'hincha_lanus',
  'hincha_newells',
  'hincha_nueva_chicago',
  'hincha_olimpo',
  'hincha_platense',
  'hincha_quilmes',
  'hincha_racing',
  'hincha_real_madrid',
  'hincha_river',
  'hincha_rosario_central',
  'hincha_san_lorenzo',
  'hincha_san_martin_sj',
  'hincha_sarmiento',
  'hincha_talleres',
  'hincha_temperley',
  'hincha_tigre',
  'hincha_union',
  'hincha_velez',
] as const;

export const AVATAR_IDS = [...BASE_AVATAR_IDS, ...CLUB_AVATAR_IDS] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];
