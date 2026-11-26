const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function fromHex(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(str: string): Uint8Array | null {
  try {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function generateRandomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * Hashes passwords using Web Crypto PBKDF2-HMAC-SHA-256 capped at 100,000 iterations
 * (Cloudflare Workers native hardware-accelerated limit).
 */
export async function hashPasswordWorker(password: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const derivedHex = toHex(new Uint8Array(derivedBuffer));
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toHex(saltBytes)}$${derivedHex}`;
}

/**
 * Verifies PBKDF2 Worker hashes as well as legacy node:crypto scrypt hashes if present.
 */
export async function verifyPasswordWorker(
  password: string,
  storedHash?: string
): Promise<boolean> {
  if (!storedHash) return false;

  if (storedHash.startsWith('pbkdf2_sha256$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    const saltBytes = fromHex(parts[2]);
    const expectedBytes = fromHex(parts[3]);
    if (
      !Number.isFinite(iterations) ||
      iterations < 1000 ||
      iterations > PBKDF2_ITERATIONS ||
      !saltBytes ||
      !expectedBytes
    ) {
      return false;
    }

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derivedBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      expectedBytes.length * 8
    );
    return timingSafeEqualBytes(new Uint8Array(derivedBuffer), expectedBytes);
  }

  // Fallback for legacy scrypt hashes (salt:hex) when running with nodejs_compat
  if (storedHash.includes(':')) {
    try {
      const nodeCrypto = await import('node:crypto');
      const [salt, keyHex] = storedHash.split(':');
      const derived = nodeCrypto.scryptSync(password, salt, 64);
      const expected = fromHex(keyHex);
      if (!expected || derived.length !== expected.length) return false;
      return timingSafeEqualBytes(new Uint8Array(derived), expected);
    } catch {
      return false;
    }
  }

  return false;
}

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

export async function signSessionWorker(userId: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const payload = toBase64Url(
    enc.encode(JSON.stringify({ uid: userId, iat: Date.now() }))
  );
  const key = await importHmacKey(secret, 'sign');
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sigBuf))}`;
}

export async function verifySessionWorker(
  token: string | undefined,
  secret: string
): Promise<string | null> {
  if (!token || !token.includes('.')) return null;
  const dotIdx = token.indexOf('.');
  const payload = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);
  if (!payload || !sigB64) return null;

  const sigBytes = fromBase64Url(sigB64);
  if (!sigBytes) return null;

  const enc = new TextEncoder();
  const key = await importHmacKey(secret, 'verify');
  const validSig = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes as BufferSource,
    enc.encode(payload)
  );
  if (!validSig) return null;

  const decodedBytes = fromBase64Url(payload);
  if (!decodedBytes) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(decodedBytes)) as {
      uid?: unknown;
      iat?: unknown;
    };
    if (typeof decoded.uid !== 'string' || typeof decoded.iat !== 'number') {
      return null;
    }
    if (Date.now() - decoded.iat > SESSION_TTL_MS) {
      return null;
    }
    return decoded.uid;
  } catch {
    return null;
  }
}

export function decodeBase64ToBytes(base64Input: string): Uint8Array {
  const clean = base64Input.includes(',') ? base64Input.split(',')[1] : base64Input;
  const binary = atob(clean.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
