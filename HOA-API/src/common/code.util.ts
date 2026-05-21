// Pass-code generator. 8-char base32-ish alphabet, ambiguity-friendly.
// Display format inserts a dash: "A7K2-Q9X3". Storage is dash-free.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars (no 0,1,O,I,L)

export function generatePassCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return out;
}

export function formatPassCode(code: string): string {
  if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`;
  return code;
}

export function normalizePassCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
