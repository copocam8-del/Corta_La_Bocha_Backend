import helmet from 'helmet';

// Cabeceras de seguridad para todas las respuestas HTTP (helmet). Se aplican en main.ts.
// - HSTS 1 año + subdominios: el navegador sólo vuelve a entrar por https.
// - nosniff: el navegador no "adivina" el tipo de archivo (un JSON nunca se ejecuta como script).
// - X-Frame-Options DENY + frame-ancestors 'none': nadie puede meter la API en un iframe.
// - Referrer-Policy: a otros sitios sólo les llega el dominio, nunca la ruta completa.
// - CSP 'none': esta API sólo devuelve JSON, no necesita cargar nada.
// No tocan CORS (lo maneja app.enableCors) ni Socket.IO (atiende /socket.io antes que Express).
export const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export const securityHeaders = () =>
  helmet({
    strictTransportSecurity: { maxAge: ONE_YEAR_SECONDS, includeSubDomains: true },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });
