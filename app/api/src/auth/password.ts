import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Stored format: "scrypt$N$r$p$<salt base64>$<hash base64>".
// Parameters are the OWASP minimum for scrypt (F1.R4, plan F1.T2).
const ALGORITHM = "scrypt";
const N = 2 ** 17;
const R = 8;
const P = 1;
const MAXMEM = 256 * 1024 * 1024;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

const SCRYPT_OPTIONS: ScryptOptions = { N, r: R, p: P, maxmem: MAXMEM };

function deriveKey(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await deriveKey(password, salt, KEY_BYTES, SCRYPT_OPTIONS);
  return [ALGORITHM, N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [algorithm, n, r, p, saltB64, hashB64] = parts;
  if (algorithm !== ALGORITHM) return false;
  if (n !== String(N) || r !== String(R) || p !== String(P)) return false;
  if (saltB64 === undefined || hashB64 === undefined) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;

  const actual = await deriveKey(password, salt, KEY_BYTES, SCRYPT_OPTIONS);
  return timingSafeEqual(actual, expected);
}
