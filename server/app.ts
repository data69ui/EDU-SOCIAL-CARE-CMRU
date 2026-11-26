import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import type {
  AcademicYear,
  ImportedStudentRow,
  UserRole,
  YearLevel,
} from '../src/types/scholarship.js';
import {
  ACADEMIC_YEARS,
  YEAR_LEVELS,
  buildDefaultStudentPassword,
  canDeleteUserAccount,
  canResetUserPassword,
  evaluateAdminSetupPassword,
  evaluateLoginAttemptStatus,
  recordFailedAttemptState,
  validateAdminSetupPayload,
  validateStudentId,
  validateStudentRegistrationPayload,
} from '../src/utils/scholarshipLogic.js';
import {
  BoundedMap,
  FixedWindowRateLimiter,
  isSafeUploadFilename,
} from '../src/utils/securityGuard.js';
import { sanitizeUser, store, StoredUser, verifyPassword } from './store.js';

dotenv.config();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'cmru_care_session';

function getSessionSecret(): string {
  return store.getRuntimeSessionSecret();
}

function signSession(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
    'utf-8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
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

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

interface AuthedRequest extends Request {
  currentUser?: StoredUser;
}

function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = bearer || cookies[COOKIE_NAME];
  const uid = verifySession(token);
  if (uid) {
    const user = store.findUserById(uid);
    if (user) {
      req.currentUser = user;
    }
  }
  next();
}

function requireRole(roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
      return;
    }
    if (!roles.includes(req.currentUser.role)) {
      res.status(403).json({ error: 'บัญชีของคุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
      return;
    }
    next();
  };
}

function requirePasswordChanged(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.currentUser?.role === 'student' && req.currentUser.mustChangePassword) {
    res.status(403).json({
      code: 'PASSWORD_CHANGE_REQUIRED',
      error: 'เพื่อความปลอดภัยของบัญชีผู้ใช้งาน กรุณาเปลี่ยนรหัสผ่านก่อนเข้าใช้งานระบบ',
    });
    return;
  }
  next();
}

const unknownLoginAttempts = new BoundedMap<
  string,
  { failedLoginAttempts: number; lockedUntil?: string }
>(5000);

const apiRateLimiter = new FixedWindowRateLimiter({
  maxRequests: 240,
  windowMs: 60 * 1000,
  maxTrackedKeys: 5000,
});

const authRateLimiter = new FixedWindowRateLimiter({
  maxRequests: 30,
  windowMs: 15 * 60 * 1000,
  maxTrackedKeys: 5000,
});

const uploadRateLimiter = new FixedWindowRateLimiter({
  maxRequests: 40,
  windowMs: 15 * 60 * 1000,
  maxTrackedKeys: 2000,
});

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'local';
}

function createRateLimitMiddleware(limiter: FixedWindowRateLimiter, message: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const decision = limiter.consume(getClientIp(req));
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}

async function handlePasswordAuthentication(
  req: Request,
  res: Response,
  params: { role: UserRole; username: string; password: string }
) {
  const normalizedUsername = params.username.trim().toLowerCase();
  const user = store.findUserByUsernameOrEmail(normalizedUsername, params.role);

  if (!user) {
    const key = `${getClientIp(req)}:${params.role}:${normalizedUsername}`;
    const existingState = unknownLoginAttempts.get(key);
    const status = evaluateLoginAttemptStatus(existingState || {});
    if (status.isLocked) {
      res.status(429).json({ error: status.errorMessage });
      return;
    }
    const nextState = recordFailedAttemptState(existingState || {});
    unknownLoginAttempts.set(key, {
      failedLoginAttempts: nextState.failedLoginAttempts,
      lockedUntil: nextState.lockedUntil,
    });
    res.status(nextState.isNowLocked ? 429 : 401).json({
      error: nextState.errorMessage,
    });
    return;
  }

  const lockoutStatus = store.checkUserLockout(user.id);
  if (lockoutStatus.isLocked) {
    await store.flush();
    res.status(429).json({ error: lockoutStatus.errorMessage });
    return;
  }

  if (!verifyPassword(params.password, user.passwordHash)) {
    const failed = store.recordUserFailedLogin(user.id);
    await store.flush();
    res.status(failed?.isNowLocked ? 429 : 401).json({
      error: failed?.errorMessage || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    });
    return;
  }

  store.clearUserFailedLogin(user.id);
  await store.flush();
  const key = `${getClientIp(req)}:${params.role}:${normalizedUsername}`;
  unknownLoginAttempts.delete(key);

  const token = setSessionCookie(req, res, user.id);
  res.json({ user: sanitizeUser(user), token });
}

function requireSameOriginOrHeader(req: Request, res: Response, next: NextFunction) {
  const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
  const hasXhrHeader = req.headers['x-requested-with'] === 'XMLHttpRequest';
  const originHeader = req.headers.origin;
  const expectedHost = String(
    req.headers['x-forwarded-host'] || req.headers.host || ''
  )
    .split(',')[0]
    .trim();
  let sameOrigin = false;
  if (typeof originHeader === 'string' && expectedHost) {
    try {
      sameOrigin = new URL(originHeader).host === expectedHost;
    } catch {
      sameOrigin = false;
    }
  }
  if (!hasBearer && !hasXhrHeader && !sameOrigin) {
    res.status(403).json({ error: 'คำขอไม่ผ่านการตรวจสอบความปลอดภัย' });
    return;
  }
  next();
}

function isHttpsRequest(req: Request): boolean {
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  const referer = String(req.headers.referer || '').toLowerCase();
  const cfVisitor = String(req.headers['cf-visitor'] || '').toLowerCase();
  return (
    req.secure ||
    fwdProto.includes('https') ||
    req.headers['x-forwarded-ssl'] === 'on' ||
    origin.startsWith('https://') ||
    referer.startsWith('https://') ||
    cfVisitor.includes('"https"')
  );
}

function buildCookieString(req: Request, value: string, maxAgeSeconds: number): string {
  const sameSite = isHttpsRequest(req)
    ? 'SameSite=None; Secure; Partitioned'
    : 'SameSite=Lax';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${sameSite}; Max-Age=${maxAgeSeconds}`;
}

function setSessionCookie(req: Request, res: Response, userId: string) {
  const token = signSession(userId);
  res.setHeader('Set-Cookie', buildCookieString(req, token, 604800));
  return token;
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const APPS_SCRIPT_TEMPLATE = `/**
 * EDU SOCIAL CARE CMRU - Google Apps Script & Google Sheets/Drive Bridge
 * สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
 */
const SPREADSHEET_ID = 'PUT_YOUR_GOOGLE_SHEET_ID_HERE';
const DRIVE_FOLDER_ID = 'PUT_YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(payload.sheetName || 'Applications') || ss.insertSheet('Applications');

    if (payload.action === 'upsertRow') {
      const headers = ['StudentID', 'FullName', 'AcademicYear', 'YearLevel', 'GPAX', 'Status', 'VolunteerHours', 'UpdatedAt'];
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(headers);
      }
      sheet.appendRow([
        payload.studentId,
        payload.fullName,
        payload.academicYear,
        payload.yearLevel,
        payload.gpax,
        payload.status,
        payload.volunteerHours || 0,
        new Date().toISOString()
      ]);
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'uploadDriveFile') {
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const bytes = Utilities.base64Decode(payload.base64Data);
      const blob = Utilities.newBlob(bytes, payload.mimeType, payload.fileName);
      const file = folder.createFile(blob);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, fileUrl: file.getUrl() })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers (preserve iframe embedding without X-Frame-Options)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    next();
  });

  // Scoped JSON payload limits to prevent oversized-body DoS attacks
  app.use('/api/uploads', express.json({ limit: '10mb' }));
  app.use('/api/admin/restore-snapshot', express.json({ limit: '10mb' }));
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Ensure store state is synced (especially on serverless cold starts / remote KV)
  app.use('/api', async (req, _res, next) => {
    try {
      const isMutation = req.method !== 'GET' && req.method !== 'HEAD';
      await store.ready(isMutation);
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use(
    '/api',
    createRateLimitMiddleware(
      apiRateLimiter,
      'มีการส่งคำขอถี่เกินไปชั่วคราว กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'
    )
  );

  const authLimitMiddleware = createRateLimitMiddleware(
    authRateLimiter,
    'มีการพยายามเข้าสู่ระบบหรือลงทะเบียนถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
  );
  const uploadLimitMiddleware = createRateLimitMiddleware(
    uploadRateLimiter,
    'มีการอัปโหลดหรือนำเข้าข้อมูลถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
  );

  app.use(attachUser);

  app.get('/uploads/:filename', async (req, res, next) => {
    try {
      const requested = decodeURIComponent(String(req.params.filename || '').trim());
      if (!requested || !isSafeUploadFilename(requested)) {
        res.status(400).json({ error: 'ชื่อไฟล์ไม่ถูกต้อง' });
        return;
      }
      const file = await store.readUploadedFile(requested);
      if (!file) {
        res.status(404).json({ error: 'ไม่พบไฟล์ที่ร้องขอ' });
        return;
      }
      const ext = path.extname(requested).toLowerCase();
      const contentType = file.mimeType || MIME_BY_EXT[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(file.buffer);
    } catch (err) {
      next(err);
    }
  });

  // Auth status & public anonymized overview metrics
  app.get('/api/auth/status', (_req, res) => {
    res.json({
      adminInitialized: store.isAdminInitialized(),
      studentAuthMode: 'student_id_password',
    });
  });

  app.get('/api/public/overview', (req, res) => {
    const rawYear = String(req.query.academicYear || 'all');
    const rawLevel = String(req.query.yearLevel || 'all');
    const academicYear: AcademicYear | 'all' =
      rawYear === 'all' || (ACADEMIC_YEARS as string[]).includes(rawYear)
        ? (rawYear as AcademicYear | 'all')
        : 'all';
    const yearLevel: YearLevel | 'all' =
      rawLevel === 'all' || (YEAR_LEVELS as string[]).includes(rawLevel)
        ? (rawLevel as YearLevel | 'all')
        : 'all';
    res.json({ overview: store.getPublicOverview(academicYear, yearLevel) });
  });

  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    if (!req.currentUser) {
      res.json({ user: null });
      return;
    }
    res.json({ user: sanitizeUser(req.currentUser) });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', buildCookieString(req, '', 0));
    res.json({ ok: true });
  });

  // Self-service account deletion (student/teacher or non-last admin)
  app.delete(
    '/api/auth/account',
    requireSameOriginOrHeader,
    requireRole(['student', 'teacher', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const target = req.currentUser!;
        const adminCount = store.getUsers().filter((u) => u.role === 'admin').length;
        if (target.role === 'admin' && adminCount <= 1) {
          res.status(400).json({ error: 'ต้องมีบัญชีผู้ดูแลระบบอย่างน้อย 1 บัญชีในระบบ' });
          return;
        }
        store.deleteUser(target.id);
        await store.flush();
        res.setHeader('Set-Cookie', buildCookieString(req, '', 0));
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  // First-time Admin registration (locked once an admin exists)
  app.post(
    '/api/auth/admin/setup',
    authLimitMiddleware,
    requireSameOriginOrHeader,
    async (req, res) => {
      try {
        const { username, password, confirmPassword, fullName } = req.body as {
          username?: string;
          password?: string;
          confirmPassword?: string;
          fullName?: string;
        };
        const check = validateAdminSetupPayload({
          fullName: fullName?.trim() || 'ผู้ดูแลระบบงานทุนการศึกษา',
          username,
          password,
          confirmPassword,
        });
        if (!check.valid) {
          res.status(400).json({ error: check.error });
          return;
        }
        const admin = store.createFirstAdmin({
          username: check.normalizedUsername,
          password: password!,
          fullName: check.normalizedFullName,
        });
        await store.flush();
        const token = setSessionCookie(req, res, admin.id);
        res.json({ user: sanitizeUser(admin), token });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  // Teacher registration (username & strong password)
  app.post(
    '/api/auth/teacher/register',
    authLimitMiddleware,
    requireSameOriginOrHeader,
    async (req, res) => {
      try {
        const { username, password, fullName } = req.body as {
          username?: string;
          password?: string;
          fullName?: string;
        };
        const normalizedUsername = String(username || '').trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,40}$/.test(normalizedUsername)) {
          res.status(400).json({
            error: 'ชื่อผู้ใช้ต้องมี 3-40 ตัวอักษร (ภาษาอังกฤษ ตัวเลข . _ - เท่านั้น)',
          });
          return;
        }
        const pwCheck = evaluateAdminSetupPassword(String(password || ''));
        if (!pwCheck.valid) {
          res.status(400).json({
            error: 'รหัสผ่านอาจารย์ต้องมีอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวอักษรภาษาอังกฤษกับตัวเลข',
          });
          return;
        }
        const teacher = store.createUser({
          role: 'teacher',
          username: normalizedUsername,
          password,
          fullName: fullName?.trim() || `อาจารย์ ${normalizedUsername}`,
          authProvider: 'password',
        });
        await store.flush();
        const token = setSessionCookie(req, res, teacher.id);
        res.json({ user: sanitizeUser(teacher), token });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  // Student registration with automatic default password (8-digit studentId) & mandatory first change
  app.post(
    '/api/auth/student/register',
    authLimitMiddleware,
    requireSameOriginOrHeader,
    async (req, res) => {
      try {
        const { email, fullName, studentId, yearLevel, academicYear } =
          req.body as {
            email?: string;
            fullName?: string;
            studentId?: string;
            yearLevel?: YearLevel;
            academicYear?: AcademicYear;
          };

        const check = validateStudentRegistrationPayload({
          studentId: studentId || '',
          fullName,
          email,
        });
        if (!check.valid) {
          res.status(400).json({ error: check.error });
          return;
        }

        if (store.findUserByUsernameOrEmail(check.normalizedStudentId, 'student')) {
          res.status(409).json({
            error: 'รหัสนักศึกษานี้มีบัญชีในระบบแล้ว กรุณาเข้าสู่ระบบด้วยรหัสนักศึกษาและรหัสผ่าน',
          });
          return;
        }

        const defaultPassword = buildDefaultStudentPassword(check.normalizedStudentId);
        const student = store.createUser({
          role: 'student',
          username: check.normalizedStudentId.toLowerCase(),
          email: check.normalizedEmail || undefined,
          password: defaultPassword,
          fullName: fullName?.trim() || `นักศึกษา ${check.normalizedStudentId}`,
          studentId: check.normalizedStudentId,
          academicYear,
          yearLevel,
          mustChangePassword: true,
          authProvider: 'password',
        });
        await store.flush();
        const token = setSessionCookie(req, res, student.id);
        res.json({ user: sanitizeUser(student), token });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  // Legacy passwordless login endpoint blocked for security
  app.post('/api/auth/student/login-id', (_req, res) => {
    res.status(410).json({
      error: 'เพื่อความปลอดภัย กรุณาเข้าสู่ระบบด้วยรหัสนักศึกษาและรหัสผ่าน',
    });
  });

  // Student Sign-In using Student ID (Username) + Password with lockout & rate limit protection
  app.post(
    '/api/auth/student/login',
    authLimitMiddleware,
    requireSameOriginOrHeader,
    async (req, res) => {
      const { studentId, password } = req.body as {
        studentId?: string;
        password?: string;
      };
      const idCheck = validateStudentId(studentId || '');
      if (!idCheck.valid) {
        res.status(400).json({ error: idCheck.error });
        return;
      }
      if (!password) {
        res.status(400).json({ error: 'กรุณากรอกรหัสผ่าน' });
        return;
      }

      await handlePasswordAuthentication(req, res, {
        role: 'student',
        username: idCheck.normalized,
        password,
      });
    }
  );

  // Password login (Student, Teacher, or Admin) with lockout & rate limit protection
  app.post(
    '/api/auth/login',
    authLimitMiddleware,
    requireSameOriginOrHeader,
    async (req, res) => {
      const { role, username, password } = req.body as {
        role?: UserRole;
        username?: string;
        password?: string;
      };
      if (!role || !username?.trim() || !password) {
        res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน' });
        return;
      }
      if (role === 'student') {
        const idCheck = validateStudentId(username);
        if (!idCheck.valid) {
          res.status(400).json({ error: idCheck.error });
          return;
        }
        await handlePasswordAuthentication(req, res, {
          role: 'student',
          username: idCheck.normalized,
          password,
        });
        return;
      }
      await handlePasswordAuthentication(req, res, {
        role,
        username,
        password,
      });
    }
  );

  // Self-service password change (Mandatory first login & Student menu)
  app.post(
    '/api/auth/change-password',
    requireSameOriginOrHeader,
    requireRole(['student', 'teacher', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const { currentPassword, newPassword, confirmPassword } = req.body as {
          currentPassword?: string;
          newPassword?: string;
          confirmPassword?: string;
        };
        const updated = store.changeUserPassword(req.currentUser!.id, {
          currentPassword: String(currentPassword ?? ''),
          newPassword: String(newPassword ?? ''),
          confirmPassword: String(confirmPassword ?? ''),
        });
        await store.flush();
        const token = setSessionCookie(req, res, updated.id);
        res.json({
          ok: true,
          message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว',
          user: sanitizeUser(updated),
          token,
        });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  // File upload endpoint
  app.post(
    '/api/uploads',
    uploadLimitMiddleware,
    requireSameOriginOrHeader,
    requireRole(['student', 'teacher', 'admin']),
    requirePasswordChanged,
    async (req, res) => {
      try {
        const { name, mimeType, base64Data } = req.body as {
          name?: string;
          mimeType?: string;
          base64Data?: string;
        };
        if (!name || !mimeType || !base64Data) {
          res.status(400).json({ error: 'ข้อมูลไฟล์ไม่ครบถ้วน' });
          return;
        }
        const saved = store.saveUploadedFile({ name, mimeType, base64Data });
        await store.flush();
        res.json({ file: saved });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  // Student endpoints (strictly scoped to req.currentUser!.id and requires password changed)
  app.get(
    '/api/student/me',
    requireRole(['student']),
    requirePasswordChanged,
    (req: AuthedRequest, res) => {
      const bundle = store.getStudentBundle(req.currentUser!.id);
      if (!bundle) {
        res.status(404).json({ error: 'ไม่พบข้อมูลนักศึกษา' });
        return;
      }
      const teacherNames = store
        .getUsers()
        .filter((u) => u.role === 'teacher' && u.fullName?.trim())
        .map((u) => u.fullName.trim());
      res.json({ bundle, teacherNames });
    }
  );

  app.put(
    '/api/student/pdpa',
    requireSameOriginOrHeader,
    requireRole(['student']),
    requirePasswordChanged,
    async (req: AuthedRequest, res) => {
      const { consented } = req.body as { consented?: boolean };
      const basicInfo = store.savePdpaDecision(req.currentUser!.id, Boolean(consented));
      await store.flush();
      res.json({ basicInfo });
    }
  );

  app.put(
    '/api/student/basic-info',
    requireSameOriginOrHeader,
    requireRole(['student']),
    requirePasswordChanged,
    async (req: AuthedRequest, res) => {
      try {
        const basicInfo = store.saveBasicInfo(req.currentUser!.id, req.body);
        await store.flush();
        res.json({ basicInfo });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.put(
    '/api/student/application',
    requireSameOriginOrHeader,
    requireRole(['student']),
    requirePasswordChanged,
    async (req: AuthedRequest, res) => {
      try {
        const { application, submitNow } = req.body;
        const saved = store.saveApplication(
          req.currentUser!.id,
          application,
          Boolean(submitNow)
        );
        await store.flush();
        res.json({ application: saved });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.post(
    '/api/student/grades',
    requireSameOriginOrHeader,
    requireRole(['student']),
    requirePasswordChanged,
    async (req: AuthedRequest, res) => {
      try {
        const { academicYear, yearLevel, semester, gpa, attachments } = req.body;
        const record = store.upsertGradeRecord({
          studentUserId: req.currentUser!.id,
          academicYear,
          yearLevel,
          semester,
          gpa,
          attachments: attachments || [],
          uploadedByRole: 'student',
          uploadedByName: req.currentUser!.fullName,
        });
        await store.flush();
        res.json({ grade: record });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.post(
    '/api/student/volunteers',
    requireSameOriginOrHeader,
    requireRole(['student']),
    requirePasswordChanged,
    async (req: AuthedRequest, res) => {
      try {
        const {
          academicYear,
          activityTitle,
          activityDetail,
          learnings,
          hours,
          activityDate,
          dailyLifeApplication,
          photos,
        } = req.body;
        const record = store.addVolunteerRecord({
          studentUserId: req.currentUser!.id,
          academicYear,
          activityTitle,
          activityDetail,
          learnings,
          hours: Number(hours),
          activityDate,
          dailyLifeApplication,
          photos: photos || [],
        });
        await store.flush();
        res.json({ volunteer: record });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  // Staff (Teacher & Admin) endpoints
  app.get('/api/staff/students', requireRole(['teacher', 'admin']), (_req, res) => {
    const teacherNames = store
      .getUsers()
      .filter((u) => u.role === 'teacher' && u.fullName?.trim())
      .map((u) => u.fullName.trim());
    res.json({ students: store.getAllStudentBundles(), teacherNames });
  });

  app.post(
    '/api/staff/students/import',
    uploadLimitMiddleware,
    requireSameOriginOrHeader,
    requireRole(['teacher', 'admin']),
    async (req, res) => {
      try {
        const { rows } = req.body as { rows?: unknown[] };
        if (!Array.isArray(rows) || rows.length === 0) {
          res.status(400).json({ error: 'ไม่พบข้อมูลรายชื่อสำหรับนำเข้า' });
          return;
        }
        if (rows.length > 500) {
          res.status(400).json({ error: 'นำเข้าได้สูงสุด 500 รายการต่อครั้ง' });
          return;
        }
        const result = store.importStudentsBulk(rows as ImportedStudentRow[]);
        await store.flush();
        res.json({ result });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.post(
    '/api/staff/students',
    requireSameOriginOrHeader,
    requireRole(['teacher', 'admin']),
    async (req, res) => {
      try {
        const row = req.body as ImportedStudentRow;
        const result = store.importStudentsBulk([row]);
        if (result.createdCount === 0 && result.updatedCount === 0) {
          res.status(400).json({
            error: result.errors[0] || 'ไม่สามารถเพิ่มรายชื่อนักศึกษาได้',
          });
          return;
        }
        await store.flush();
        res.json({ result });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.patch(
    '/api/staff/applications/:studentUserId/review',
    requireSameOriginOrHeader,
    requireRole(['teacher', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const { status, advisorComment } = req.body;
        const updated = store.reviewApplication(String(req.params.studentUserId), {
          status,
          advisorComment: advisorComment || '',
          reviewerName: req.currentUser!.fullName,
        });
        await store.flush();
        res.json({ application: updated });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.patch(
    '/api/staff/volunteers/:volunteerId/review',
    requireSameOriginOrHeader,
    requireRole(['teacher', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const { approvalStatus, approvedHours, advisorNote } = req.body;
        const updated = store.reviewVolunteerRecord(String(req.params.volunteerId), {
          approvalStatus,
          approvedHours: Number(approvedHours || 0),
          advisorNote: advisorNote || '',
          reviewerName: req.currentUser!.fullName,
        });
        await store.flush();
        res.json({ volunteer: updated });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.post(
    '/api/staff/grades/:studentUserId',
    requireSameOriginOrHeader,
    requireRole(['teacher', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const { academicYear, yearLevel, semester, gpa, attachments } = req.body;
        const record = store.upsertGradeRecord({
          studentUserId: String(req.params.studentUserId),
          academicYear,
          yearLevel,
          semester,
          gpa,
          attachments: attachments || [],
          uploadedByRole: req.currentUser!.role,
          uploadedByName: req.currentUser!.fullName,
        });
        await store.flush();
        res.json({ grade: record });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  // Admin endpoints
  app.get('/api/admin/users', requireRole(['admin']), (_req, res) => {
    res.json({ users: store.getUsers().map(sanitizeUser) });
  });

  app.patch(
    '/api/admin/users/:userId/password',
    requireSameOriginOrHeader,
    requireRole(['admin']),
    async (req: AuthedRequest, res) => {
      try {
        if (!canResetUserPassword(req.currentUser!.role)) {
          res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
          return;
        }
        const { resetToDefault, newPassword } = req.body as {
          resetToDefault?: boolean;
          newPassword?: string;
        };
        const updated = store.resetUserPassword(String(req.params.userId), {
          resetToDefault: Boolean(resetToDefault),
          newPassword,
        });
        await store.flush();
        res.json({
          user: sanitizeUser(updated),
          message:
            updated.role === 'student'
              ? 'รีเซ็ตรหัสผ่านนักศึกษาเรียบร้อยแล้ว นักศึกษาจะต้องเปลี่ยนรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งถัดไป'
              : 'แก้ไขรหัสผ่านเรียบร้อยแล้ว',
        });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.post(
    '/api/admin/users',
    requireSameOriginOrHeader,
    requireRole(['admin']),
    async (req, res) => {
      try {
        const { role, username, password, fullName, studentId } = req.body as {
          role?: UserRole;
          username?: string;
          password?: string;
          fullName?: string;
          studentId?: string;
        };
        if (!role || (!username?.trim() && !studentId?.trim())) {
          res.status(400).json({ error: 'กรุณากรอกข้อมูลบัญชีผู้ใช้งานให้ครบถ้วน' });
          return;
        }

        if (role === 'student') {
          const idCheck = validateStudentId(studentId || username || '');
          if (!idCheck.valid) {
            res.status(400).json({ error: idCheck.error });
            return;
          }
          const cleanCustomPw = password?.trim();
          if (cleanCustomPw && cleanCustomPw.length < 4) {
            res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
            return;
          }
          const user = store.createUser({
            role: 'student',
            username: idCheck.normalized.toLowerCase(),
            password: cleanCustomPw || buildDefaultStudentPassword(idCheck.normalized),
            fullName: fullName?.trim() || `นักศึกษา ${idCheck.normalized}`,
            studentId: idCheck.normalized,
            mustChangePassword: true,
            authProvider: 'password',
          });
          await store.flush();
          res.json({ user: sanitizeUser(user) });
          return;
        }

        if (!password || password.length < 4) {
          res.status(400).json({ error: 'กรุณากรอกรหัสผ่านอย่างน้อย 4 ตัวอักษร' });
          return;
        }

        const user = store.createUser({
          role,
          username: username!.trim(),
          password,
          fullName: fullName?.trim() || username!.trim(),
          mustChangePassword: false,
          authProvider: 'password',
        });
        await store.flush();
        res.json({ user: sanitizeUser(user) });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.delete(
    '/api/admin/users/:userId',
    requireSameOriginOrHeader,
    requireRole(['admin']),
    async (req: AuthedRequest, res) => {
      try {
        const targetId = String(req.params.userId || '').trim();
        const targetUser = store.findUserById(targetId);
        if (!targetUser) {
          res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้งาน' });
          return;
        }
        const adminCount = store.getUsers().filter((u) => u.role === 'admin').length;
        const check = canDeleteUserAccount({
          actorRole: req.currentUser!.role,
          actorUserId: req.currentUser!.id,
          targetUserId: targetUser.id,
          targetRole: targetUser.role,
          adminCount,
        });
        if (!check.allowed) {
          res.status(400).json({ error: check.reason || 'ไม่สามารถลบบัญชีผู้ใช้งานนี้ได้' });
          return;
        }
        const deleted = store.deleteUser(targetUser.id);
        await store.flush();
        res.json({ deletedUser: sanitizeUser(deleted) });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.get('/api/workspace/config', requireRole(['student', 'teacher', 'admin']), (_req, res) => {
    res.json({ config: store.getWorkspaceConfig() });
  });

  app.put(
    '/api/workspace/config',
    requireSameOriginOrHeader,
    requireRole(['teacher', 'admin']),
    async (req, res) => {
      const saved = store.saveWorkspaceConfig((req.body || {}) as Record<string, unknown>);
      await store.flush();
      res.json({ config: saved });
    }
  );

  app.post(
    '/api/admin/restore-snapshot',
    uploadLimitMiddleware,
    requireSameOriginOrHeader,
    requireRole(['admin']),
    async (req, res) => {
      try {
        const result = store.restoreSnapshot(req.body);
        await store.flush();
        res.json({ result });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.get('/api/admin/apps-script-template', requireRole(['admin', 'teacher']), (_req, res) => {
    res.json({ code: APPS_SCRIPT_TEMPLATE });
  });

  // Global API & JSON parse error handler (prevents server crash or stack leakage)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { type?: string; status?: number; message?: string };
    if (e?.type === 'entity.too.large' || e?.status === 413) {
      res.status(413).json({ error: 'ขนาดข้อมูลที่ส่งเกินขีดจำกัดที่ระบบอนุญาต' });
      return;
    }
    if (e?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      res.status(400).json({ error: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' });
      return;
    }
    console.error('[server error]', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง' });
  });

  return app;
}
