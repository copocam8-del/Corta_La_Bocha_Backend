// Versión vigente de los Términos y la Política de privacidad. Si un día cambian (y el cambio es importante),
// se sube esta fecha: todos los usuarios quedan con terminosPendientes y la app les pide aceptar de nuevo.
// Va igual que LEGAL_LAST_UPDATE del frontend (components/LegalLayout.tsx).
export const TERMS_VERSION = '2026-10-27';

export const MENSAJE_ACEPTAR_TERMINOS = 'Tenés que aceptar los Términos y la Política de privacidad.';
export const MENSAJE_VERSION_TERMINOS = 'Esa no es la versión vigente de los Términos. Recargá la página y probá de nuevo.';

// Falta aceptar si nunca aceptó o si aceptó una versión anterior
export const terminosPendientes = (version: string | null | undefined) => version !== TERMS_VERSION;
