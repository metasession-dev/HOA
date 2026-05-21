import * as crypto from 'crypto';

/**
 * Symmetric authenticated encryption for sensitive secrets-at-rest
 * (TOTP secrets, future API keys, etc).
 *
 * Algorithm: AES-256-GCM with a 12-byte IV. Ciphertext format on the wire:
 *   base64( IV || tag || ct )
 *   where IV=12 bytes, tag=16 bytes, ct=variable.
 *
 * Key: 32 raw bytes derived from APP_ENCRYPTION_KEY env via sha256.
 * In production, set APP_ENCRYPTION_KEY to a 32+ byte random string.
 */

const ALGO = 'aes-256-gcm';

/**
 * Phase 6 review #14: keys are versioned so we can rotate without re-encrypting
 * everything in a single migration. Each ciphertext starts with a 1-byte
 * version (0-255). New writes use the current version (= the highest available
 * key); decryption looks up the key matching the ciphertext's version byte.
 *
 * Set keys via env: APP_ENCRYPTION_KEY (=v1), APP_ENCRYPTION_KEY_V2, etc.
 * APP_ENCRYPTION_KEY_VERSION selects which one to encrypt new payloads with
 * (defaults to the highest version found). To rotate: add APP_ENCRYPTION_KEY_V2,
 * bump APP_ENCRYPTION_KEY_VERSION to 2, redeploy. Old v1 payloads still decrypt
 * via the v1 key; new writes are v2.
 */

function getKeyForVersion(version: number): Buffer {
  let raw: string | undefined;
  if (version === 1) raw = process.env.APP_ENCRYPTION_KEY;
  else raw = process.env[`APP_ENCRYPTION_KEY_V${version}`];
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`APP_ENCRYPTION_KEY${version === 1 ? '' : `_V${version}`} is required in production`);
    }
    return crypto.createHash('sha256').update('dev-only-v' + version + '-' + (process.env.JWT_SECRET || 'fallback')).digest();
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function currentVersion(): number {
  const env = process.env.APP_ENCRYPTION_KEY_VERSION;
  if (env) {
    const v = Number(env);
    if (Number.isFinite(v) && v >= 1 && v <= 255) return v;
  }
  // Probe for the highest available key version (1..10)
  let highest = 1;
  for (let v = 10; v >= 1; v--) {
    const present = v === 1 ? !!process.env.APP_ENCRYPTION_KEY : !!process.env[`APP_ENCRYPTION_KEY_V${v}`];
    if (present) { highest = v; break; }
  }
  return highest;
}

export function encrypt(plain: string): string {
  const version = currentVersion();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKeyForVersion(version), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // version (1 byte) || IV (12) || tag (16) || ct
  return Buffer.concat([Buffer.from([version]), iv, tag, ct]).toString('base64');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  // Back-compat: legacy payloads (pre-Phase-6) had no version byte. Detect
  // them by length parity / decryption fallback. We try the new format first
  // and fall back to v1-without-prefix if that fails.
  if (buf.length >= 1 + 12 + 16 + 1) {
    try {
      const version = buf[0];
      if (version >= 1 && version <= 255) {
        const iv = buf.subarray(1, 13);
        const tag = buf.subarray(13, 29);
        const ct = buf.subarray(29);
        const decipher = crypto.createDecipheriv(ALGO, getKeyForVersion(version), iv);
        decipher.setAuthTag(tag);
        const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        return pt.toString('utf8');
      }
    } catch { /* fall through to legacy */ }
  }
  // Legacy: IV (12) || tag (16) || ct, encrypted with v1 key.
  if (buf.length < 12 + 16 + 1) throw new Error('encrypted payload too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKeyForVersion(1), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Stable JSON serializer: object keys are sorted lexicographically at every
 * level so the byte output is deterministic regardless of insertion order.
 * Used by the audit hash chain so the same logical row produces the same hash
 * even after a Postgres jsonb round-trip (which doesn't preserve key order).
 */
export function stableStringify(value: any): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: any): any {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortKeys);
  const out: Record<string, any> = {};
  for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
  return out;
}
