// Pure email and password rules for F1 (registration and login).
// No imports: these functions take strings and return strings or null.

export const EMAIL_ERROR = "Enter a valid email address.";
export const PASSWORD_ERROR = "Password must be at least 8 characters.";

const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;

// F1.R2: trim surrounding spaces and compare case-insensitively.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// F1.R1: after normalizing, exactly one "@", text on both sides,
// a dot in the domain part, no spaces, at most 254 characters.
export function validateEmail(email: string): string | null {
  const normalized = normalizeEmail(email);

  if (normalized.length > MAX_EMAIL_LENGTH) return EMAIL_ERROR;
  if (/\s/.test(normalized)) return EMAIL_ERROR;

  const parts = normalized.split("@");
  if (parts.length !== 2) return EMAIL_ERROR;

  const [local, domain] = parts as [string, string];
  if (local.length === 0 || domain.length === 0) return EMAIL_ERROR;
  if (!domain.includes(".")) return EMAIL_ERROR;

  return null;
}

// F1.R3: at least 8 characters. Spaces count. No maximum, no character-type rules.
// The password is not trimmed.
export function validatePassword(password: string): string | null {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) return PASSWORD_ERROR;
  return null;
}
