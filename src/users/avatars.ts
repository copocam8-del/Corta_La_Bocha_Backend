// Set de avatares propios. El usuario elige uno por su id; el dibujo vive en el frontend
// (src/profile/avatars.tsx en Corta_La_Bocha_Frontend). Si agregás uno, agregalo en los dos repos.
export const AVATAR_IDS = [
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

export type AvatarId = (typeof AVATAR_IDS)[number];
