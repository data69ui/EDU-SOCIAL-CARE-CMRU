export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * Bounded fixed-window rate limiter safe against memory exhaustion (OOM DoS).
 */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxTrackedKeys: number;

  constructor(options: {
    maxRequests: number;
    windowMs: number;
    maxTrackedKeys?: number;
  }) {
    this.maxRequests = Math.max(1, options.maxRequests);
    this.windowMs = Math.max(1000, options.windowMs);
    this.maxTrackedKeys = Math.max(100, options.maxTrackedKeys ?? 5000);
  }

  private pruneExpired(nowMs: number) {
    if (this.buckets.size < this.maxTrackedKeys) return;
    for (const [k, bucket] of this.buckets.entries()) {
      if (nowMs >= bucket.resetAt) {
        this.buckets.delete(k);
      }
    }
    while (this.buckets.size >= this.maxTrackedKeys) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey === undefined) break;
      this.buckets.delete(oldestKey);
    }
  }

  consume(key: string, nowMs = Date.now()): RateLimitDecision {
    const normalizedKey = String(key || 'anonymous').slice(0, 128);
    const existing = this.buckets.get(normalizedKey);

    if (!existing || nowMs >= existing.resetAt) {
      this.pruneExpired(nowMs);
      this.buckets.set(normalizedKey, {
        count: 1,
        resetAt: nowMs + this.windowMs,
      });
      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - 1),
        retryAfterSeconds: Math.ceil(this.windowMs / 1000),
      };
    }

    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - existing.count),
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
    };
  }
}

/**
 * Bounded Map for tracking transient security state (e.g. unknown login IP throttling)
 * without unbounded heap growth.
 */
export class BoundedMap<K, V> {
  private readonly store = new Map<K, V>();
  private readonly maxEntries: number;

  constructor(maxEntries = 5000) {
    this.maxEntries = Math.max(50, maxEntries);
  }

  get(key: K): V | undefined {
    return this.store.get(key);
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, value);
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  get size(): number {
    return this.store.size;
  }
}

export const MAX_SERVER_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export type CanonicalUploadExt = '.jpg' | '.png' | '.webp' | '.pdf';

export interface ValidatedUploadBinary {
  valid: boolean;
  canonicalExt?: CanonicalUploadExt;
  canonicalMime?: string;
  error?: string;
}

function detectBinaryFileType(bytes: Uint8Array): {
  ext: CanonicalUploadExt;
  mime: string;
} | null {
  if (bytes.length < 4) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: '.png', mime: 'image/png' };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }

  // PDF: "%PDF-"
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return { ext: '.pdf', mime: 'application/pdf' };
  }

  return null;
}

/**
 * Validates decoded uploaded file bytes via magic-byte signature, claimed MIME, and max byte size.
 * Prevents HTML/SVG/script upload XSS and oversized payload exhaustion.
 */
export function validateUploadedBinary(params: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  maxBytes?: number;
}): ValidatedUploadBinary {
  const maxBytes = params.maxBytes ?? MAX_SERVER_UPLOAD_BYTES;
  if (!params.bytes || params.bytes.length === 0) {
    return { valid: false, error: 'ไฟล์ที่อัปโหลดว่างเปล่า' };
  }
  if (params.bytes.length > maxBytes) {
    return {
      valid: false,
      error: `ขนาดไฟล์เกินกำหนดสูงสุด ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
    };
  }

  const detected = detectBinaryFileType(params.bytes);
  if (!detected) {
    return {
      valid: false,
      error: 'รูปแบบไฟล์ไม่ปลอดภัยหรือไม่ได้รับอนุญาต (รองรับเฉพาะ JPG, PNG, WEBP และ PDF ที่ถูกต้อง)',
    };
  }

  const normalizedMime = String(params.mimeType || '').trim().toLowerCase();
  const allowedMimesForDetected: Record<CanonicalUploadExt, string[]> = {
    '.jpg': ['image/jpeg', 'image/jpg'],
    '.png': ['image/png'],
    '.webp': ['image/webp'],
    '.pdf': ['application/pdf'],
  };

  if (!allowedMimesForDetected[detected.ext].includes(normalizedMime)) {
    return {
      valid: false,
      error: 'ชนิดไฟล์ไม่ตรงกับเนื้อหาไฟล์จริง',
    };
  }

  return {
    valid: true,
    canonicalExt: detected.ext,
    canonicalMime: detected.mime,
  };
}

export function clampPayloadText(value: unknown, maxLength = 2000): string {
  const raw = String(value ?? '');
  // Strip NUL and C0 control chars except newline/tab/CR
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

export function isSafeUploadFilename(filename: string): boolean {
  return /^[a-zA-Z0-9._-]{4,120}$/.test(filename) && !filename.includes('..');
}

export function isSafeGoogleResourceId(id: unknown): boolean {
  if (typeof id !== 'string' || !id.trim()) return false;
  return /^[a-zA-Z0-9_-]{10,120}$/.test(id.trim());
}

export function sanitizeGoogleWorkspaceUrl(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.trim()) return undefined;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return undefined;
    const allowedHosts = ['docs.google.com', 'drive.google.com'];
    if (!allowedHosts.includes(parsed.hostname)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeAppsScriptWebAppUrl(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.trim()) return undefined;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return undefined;
    if (parsed.hostname !== 'script.google.com') return undefined;
    // Allow standard Apps Script Web App URLs (/macros/s/.../exec or /dev, and domain-scoped /a/macros/.../exec)
    if (!/^\/(?:a\/[^/]+\/)?macros\/s\/[a-zA-Z0-9_-]{10,160}\/(?:exec|dev)$/.test(parsed.pathname)) {
      return undefined;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeWorkspaceConfigInput(raw: Record<string, unknown>): {
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  spreadsheetUrl?: string;
  driveFolderId?: string;
  driveFolderName?: string;
  driveFolderUrl?: string;
  appsScriptWebAppUrl?: string;
  appsScriptSavedAt?: string;
  lastSyncedAt?: string;
  lastSyncedBy?: string;
} {
  const spreadsheetId = isSafeGoogleResourceId(raw.spreadsheetId)
    ? String(raw.spreadsheetId).trim()
    : undefined;
  const driveFolderId = isSafeGoogleResourceId(raw.driveFolderId)
    ? String(raw.driveFolderId).trim()
    : undefined;
  const appsScriptWebAppUrl = sanitizeAppsScriptWebAppUrl(raw.appsScriptWebAppUrl);

  return {
    ...(spreadsheetId ? { spreadsheetId } : {}),
    ...(raw.spreadsheetTitle
      ? { spreadsheetTitle: clampPayloadText(raw.spreadsheetTitle, 200).trim() }
      : {}),
    ...(sanitizeGoogleWorkspaceUrl(raw.spreadsheetUrl)
      ? { spreadsheetUrl: sanitizeGoogleWorkspaceUrl(raw.spreadsheetUrl) }
      : spreadsheetId
        ? { spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` }
        : {}),
    ...(driveFolderId ? { driveFolderId } : {}),
    ...(raw.driveFolderName
      ? { driveFolderName: clampPayloadText(raw.driveFolderName, 200).trim() }
      : {}),
    ...(sanitizeGoogleWorkspaceUrl(raw.driveFolderUrl)
      ? { driveFolderUrl: sanitizeGoogleWorkspaceUrl(raw.driveFolderUrl) }
      : driveFolderId
        ? { driveFolderUrl: `https://drive.google.com/drive/folders/${driveFolderId}` }
        : {}),
    ...(appsScriptWebAppUrl ? { appsScriptWebAppUrl } : {}),
    ...(appsScriptWebAppUrl && raw.appsScriptSavedAt
      ? { appsScriptSavedAt: clampPayloadText(raw.appsScriptSavedAt, 64).trim() }
      : {}),
    ...(raw.lastSyncedAt ? { lastSyncedAt: clampPayloadText(raw.lastSyncedAt, 64).trim() } : {}),
    ...(raw.lastSyncedBy ? { lastSyncedBy: clampPayloadText(raw.lastSyncedBy, 120).trim() } : {}),
  };
}

