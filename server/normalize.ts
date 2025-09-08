// server/normalize.ts
export function normalizeUnicode(input: string): string {
  return input.normalize('NFKC').trim();
}

export function digitsOnly(input: string): string {
  return input.replace(/\D+/g, '');
}

/**
 * Canonicalize to a US 10-digit phone (no country code).
 * Returns null if it can't produce a valid 10-digit number.
 */
export function normalizePhoneUS(input: string): string | null {
  const s = digitsOnly(normalizeUnicode(input));
  if (s.length === 11 && s.startsWith('1')) return s.slice(1); // strip +1
  if (s.length === 10) return s;
  return null;
}

/**
 * Canonicalize to E.164 (requires a default country).
 * Here we implement US-only E.164 (+1XXXXXXXXXX).
 */
export function normalizePhoneE164US(input: string): string | null {
  const ten = normalizePhoneUS(input);
  return ten ? `+1${ten}` : null;
}

/** If you ever accept a text password, normalize it safely. */
export function normalizePasswordString(input: string): string {
  // Unicode NFKC, trim, collapse internal whitespace to single space
  const nk = normalizeUnicode(input);
  return nk.replace(/\s+/g, ' ');
}
