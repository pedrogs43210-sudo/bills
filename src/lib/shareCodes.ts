/**
 * The code in an invite link.
 *
 * It is the whole of the permission: anybody holding it is in, anybody without it cannot find the
 * split. There is no password behind it and no account to check, so the only thing standing between
 * a stranger and somebody's dinner is how hard this is to guess.
 *
 * Twelve characters from a 30-letter alphabet is about 59 bits. Guessing one at a thousand attempts
 * a second would take far longer than the seven days the split exists for.
 */

/**
 * No O, I, l, 1, U or 0. A code gets read aloud across a table at least once, and those are the
 * characters that turn into a different code when it is.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const CODE_LENGTH = 12;

export function newShareCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // Modulo bias across 30 letters from 256 values is negligible at this length, and the alternative
  // — rejection sampling — buys nothing against an attacker who cannot make 2^50 attempts anyway.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isValidShareCode(code: unknown): boolean {
  if (typeof code !== "string" || code.length !== CODE_LENGTH) return false;
  // Upper-cased first: a link that has been through a chat app, an email client and a retype can
  // arrive in any case, and refusing it would be refusing a correct code.
  return [...code.toUpperCase()].every((c) => ALPHABET.includes(c));
}
