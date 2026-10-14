// Quién es admin: los mails de ADMIN_EMAILS (separados por coma), comparados en minúsculas contra
// el email del usuario logueado. Sin la variable, nadie es admin.

export function parseAdminEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined, admins: Set<string>): boolean {
  return !!email && admins.has(email.trim().toLowerCase());
}
