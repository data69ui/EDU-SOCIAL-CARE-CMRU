import type {
  AcademicYear,
  ApplicationStatus,
  BasicInfoData,
  GradeRecord,
  ImportedStudentRow,
  ScholarshipApplicationData,
  SemesterType,
  UploadedFileMeta,
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
import { signSessionWorker, verifySessionWorker } from './crypto.js';
import { D1Store, sanitizeUser, StoredUser } from './d1Store.js';
import type { CloudflareEnv } from './types.js';

const COOKIE_NAME = 'cmru_care_session';

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

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-DNS-Prefetch-Control', 'off');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    ...(extraHeaders || {}),
  });
  return withSecurityHeaders(
    new Response(JSON.stringify(data), { status, headers })
  );
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'local'
  );
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      try {
        result[k] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        result[k] = part.slice(idx + 1).trim();
      }
    }
  }
  return result;
}

function buildCookieHeader(request: Request, value: string, maxAgeSeconds: number): string {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const isHttps = proto === 'https';
  const sameSite = isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${sameSite}; Max-Age=${maxAgeSeconds}`;
}

function verifySameOriginOrHeader(request: Request): boolean {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) return true;
  if (request.headers.get('x-requested-with') === 'XMLHttpRequest') return true;

  const origin = request.headers.get('origin');
  const expectedHost = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    new URL(request.url).host
  )
    .split(',')[0]
    .trim();

  if (origin && expectedHost) {
    try {
      return new URL(origin).host === expectedHost;
    } catch {
      return false;
    }
  }
  return false;
}

async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: 'ขนาดข้อมูลที่ส่งเกินขีดจำกัดที่ระบบอนุญาต' }, 413),
    };
  }

  let text = '';
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' }, 400),
    };
  }

  const byteLen = new TextEncoder().encode(text).length;
  if (byteLen > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: 'ขนาดข้อมูลที่ส่งเกินขีดจำกัดที่ระบบอนุญาต' }, 413),
    };
  }

  if (!text.trim()) {
    return { ok: true, data: {} as T };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' }, 400),
    };
  }
}

function checkRateLimit(
  limiter: FixedWindowRateLimiter,
  request: Request,
  message: string
): Response | null {
  const decision = limiter.consume(getClientIp(request));
  if (!decision.allowed) {
    return jsonResponse(
      { error: message },
      429,
      { 'Retry-After': String(decision.retryAfterSeconds) }
    );
  }
  return null;
}

function checkRole(
  currentUser: StoredUser | null,
  roles: UserRole[]
): Response | null {
  if (!currentUser) {
    return jsonResponse({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, 401);
  }
  if (!roles.includes(currentUser.role)) {
    return jsonResponse({ error: 'บัญชีของคุณไม่มีสิทธิ์เข้าถึงส่วนนี้' }, 403);
  }
  return null;
}

function checkPasswordChanged(currentUser: StoredUser | null): Response | null {
  if (currentUser?.role === 'student' && currentUser.mustChangePassword) {
    return jsonResponse(
      {
        code: 'PASSWORD_CHANGE_REQUIRED',
        error: 'เพื่อความปลอดภัยของบัญชีผู้ใช้งาน กรุณาเปลี่ยนรหัสผ่านก่อนเข้าใช้งานระบบ',
      },
      403
    );
  }
  return null;
}

async function handlePasswordAuth(
  request: Request,
  store: D1Store,
  sessionSecret: string,
  params: { role: UserRole; username: string; password: string }
): Promise<Response> {
  const normalizedUsername = params.username.trim().toLowerCase();
  const user = await store.findUserByUsernameOrEmail(normalizedUsername, params.role);

  if (!user) {
    const key = `${getClientIp(request)}:${params.role}:${normalizedUsername}`;
    const existingState = unknownLoginAttempts.get(key);
    const status = evaluateLoginAttemptStatus(existingState || {});
    if (status.isLocked) {
      return jsonResponse({ error: status.errorMessage }, 429);
    }
    const nextState = recordFailedAttemptState(existingState || {});
    unknownLoginAttempts.set(key, {
      failedLoginAttempts: nextState.failedLoginAttempts,
      lockedUntil: nextState.lockedUntil,
    });
    return jsonResponse({ error: nextState.errorMessage }, nextState.isNowLocked ? 429 : 401);
  }

  const lockoutStatus = await store.checkUserLockout(user.id);
  if (lockoutStatus.isLocked) {
    return jsonResponse({ error: lockoutStatus.errorMessage }, 429);
  }

  if (!(await store.verifyPassword(params.password, user.passwordHash))) {
    const failed = await store.recordUserFailedLogin(user.id);
    return jsonResponse(
      { error: failed?.errorMessage || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
      failed?.isNowLocked ? 429 : 401
    );
  }

  await store.clearUserFailedLogin(user.id);
  const key = `${getClientIp(request)}:${params.role}:${normalizedUsername}`;
  unknownLoginAttempts.delete(key);

  const token = await signSessionWorker(user.id, sessionSecret);
  return jsonResponse(
    { user: sanitizeUser(user), token },
    200,
    { 'Set-Cookie': buildCookieHeader(request, token, 604800) }
  );
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    const store = new D1Store(env);

    // Serve uploaded attachments directly from Cloudflare R2
    if (pathname.startsWith('/uploads/') && (method === 'GET' || method === 'HEAD')) {
      const rawName = pathname.slice('/uploads/'.length);
      let requested = '';
      try {
        requested = decodeURIComponent(rawName).trim();
      } catch {
        return jsonResponse({ error: 'ชื่อไฟล์ไม่ถูกต้อง' }, 400);
      }
      if (!requested || !isSafeUploadFilename(requested)) {
        return jsonResponse({ error: 'ชื่อไฟล์ไม่ถูกต้อง' }, 400);
      }
      const file = await store.readUploadedFileFromR2(requested);
      if (!file) {
        return jsonResponse({ error: 'ไม่พบไฟล์ที่ร้องขอ' }, 404);
      }
      const extDot = requested.lastIndexOf('.');
      const ext = extDot >= 0 ? requested.slice(extDot).toLowerCase() : '';
      const contentType = file.mimeType || MIME_BY_EXT[ext] || 'application/octet-stream';
      const headers = new Headers({
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=3600',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      return new Response(method === 'HEAD' ? null : file.buffer, { status: 200, headers });
    }

    if (!pathname.startsWith('/api/')) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return jsonResponse({ error: 'ไม่พบเส้นทางที่ร้องขอ' }, 404);
    }

    try {
      if (pathname === '/api/health' && method === 'GET') {
        return jsonResponse({ ok: true, timestamp: new Date().toISOString(), runtime: 'cloudflare-workers' });
      }

      const apiLimited = checkRateLimit(
        apiRateLimiter,
        request,
        'มีการส่งคำขอถี่เกินไปชั่วคราว กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'
      );
      if (apiLimited) return apiLimited;

      const sessionSecret = await store.getOrCreateSessionSecret();

      // Resolve authenticated session from Bearer token or cookie
      const cookies = parseCookies(request.headers.get('cookie'));
      const authHeader = request.headers.get('authorization') || '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const token = bearer || cookies[COOKIE_NAME];
      let currentUser: StoredUser | null = null;
      if (token) {
        const uid = await verifySessionWorker(token, sessionSecret);
        if (uid) {
          currentUser = (await store.findUserById(uid)) || null;
        }
      }

      // Public routes
      if (pathname === '/api/auth/status' && method === 'GET') {
        return jsonResponse({
          adminInitialized: await store.isAdminInitialized(),
          studentAuthMode: 'student_id_password',
        });
      }

      if (pathname === '/api/public/overview' && method === 'GET') {
        const rawYear = String(url.searchParams.get('academicYear') || 'all');
        const rawLevel = String(url.searchParams.get('yearLevel') || 'all');
        const academicYear: AcademicYear | 'all' =
          rawYear === 'all' || (ACADEMIC_YEARS as string[]).includes(rawYear)
            ? (rawYear as AcademicYear | 'all')
            : 'all';
        const yearLevel: YearLevel | 'all' =
          rawLevel === 'all' || (YEAR_LEVELS as string[]).includes(rawLevel)
            ? (rawLevel as YearLevel | 'all')
            : 'all';
        return jsonResponse({
          overview: await store.getPublicOverview(academicYear, yearLevel),
        });
      }

      if (pathname === '/api/auth/me' && method === 'GET') {
        return jsonResponse({ user: currentUser ? sanitizeUser(currentUser) : null });
      }

      if (pathname === '/api/auth/logout' && method === 'POST') {
        return jsonResponse(
          { ok: true },
          200,
          { 'Set-Cookie': buildCookieHeader(request, '', 0) }
        );
      }

      // State-changing CSRF origin/header guard
      if (method !== 'GET' && method !== 'HEAD') {
        if (!verifySameOriginOrHeader(request)) {
          return jsonResponse({ error: 'คำขอไม่ผ่านการตรวจสอบความปลอดภัย' }, 403);
        }
      }

      if (pathname === '/api/auth/account' && method === 'DELETE') {
        const roleErr = checkRole(currentUser, ['student', 'teacher', 'admin']);
        if (roleErr) return roleErr;
        try {
          const allUsers = await store.getUsers();
          const adminCount = allUsers.filter((u) => u.role === 'admin').length;
          if (currentUser!.role === 'admin' && adminCount <= 1) {
            return jsonResponse({ error: 'ต้องมีบัญชีผู้ดูแลระบบอย่างน้อย 1 บัญชีในระบบ' }, 400);
          }
          await store.deleteUser(currentUser!.id);
          return jsonResponse(
            { ok: true },
            200,
            { 'Set-Cookie': buildCookieHeader(request, '', 0) }
          );
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/auth/admin/setup' && method === 'POST') {
        const authLimited = checkRateLimit(
          authRateLimiter,
          request,
          'มีการพยายามเข้าสู่ระบบหรือลงทะเบียนถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
        );
        if (authLimited) return authLimited;

        const parsed = await readJsonBody<{
          username?: string;
          password?: string;
          confirmPassword?: string;
          fullName?: string;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const { username, password, confirmPassword, fullName } = parsed.data;
          const check = validateAdminSetupPayload({
            fullName: fullName?.trim() || 'ผู้ดูแลระบบงานทุนการศึกษา',
            username,
            password,
            confirmPassword,
          });
          if (!check.valid) {
            return jsonResponse({ error: check.error }, 400);
          }
          const admin = await store.createFirstAdmin({
            username: check.normalizedUsername,
            password: password!,
            fullName: check.normalizedFullName,
          });
          const newToken = await signSessionWorker(admin.id, sessionSecret);
          return jsonResponse(
            { user: sanitizeUser(admin), token: newToken },
            200,
            { 'Set-Cookie': buildCookieHeader(request, newToken, 604800) }
          );
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/auth/teacher/register' && method === 'POST') {
        const authLimited = checkRateLimit(
          authRateLimiter,
          request,
          'มีการพยายามเข้าสู่ระบบหรือลงทะเบียนถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
        );
        if (authLimited) return authLimited;

        const parsed = await readJsonBody<{
          username?: string;
          password?: string;
          fullName?: string;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const { username, password, fullName } = parsed.data;
          const normalizedUsername = String(username || '').trim().toLowerCase();
          if (!/^[a-z0-9._-]{3,40}$/.test(normalizedUsername)) {
            return jsonResponse(
              { error: 'ชื่อผู้ใช้ต้องมี 3-40 ตัวอักษร (ภาษาอังกฤษ ตัวเลข . _ - เท่านั้น)' },
              400
            );
          }
          const pwCheck = evaluateAdminSetupPassword(String(password || ''));
          if (!pwCheck.valid) {
            return jsonResponse(
              {
                error:
                  'รหัสผ่านอาจารย์ต้องมีอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวอักษรภาษาอังกฤษกับตัวเลข',
              },
              400
            );
          }
          const teacher = await store.createUser({
            role: 'teacher',
            username: normalizedUsername,
            password,
            fullName: fullName?.trim() || `อาจารย์ ${normalizedUsername}`,
            authProvider: 'password',
          });
          const newToken = await signSessionWorker(teacher.id, sessionSecret);
          return jsonResponse(
            { user: sanitizeUser(teacher), token: newToken },
            200,
            { 'Set-Cookie': buildCookieHeader(request, newToken, 604800) }
          );
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/auth/student/register' && method === 'POST') {
        const authLimited = checkRateLimit(
          authRateLimiter,
          request,
          'มีการพยายามเข้าสู่ระบบหรือลงทะเบียนถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
        );
        if (authLimited) return authLimited;

        const parsed = await readJsonBody<{
          email?: string;
          fullName?: string;
          studentId?: string;
          yearLevel?: YearLevel;
          academicYear?: AcademicYear;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const { email, fullName, studentId, yearLevel, academicYear } = parsed.data;
          const check = validateStudentRegistrationPayload({
            studentId: studentId || '',
            fullName,
            email,
          });
          if (!check.valid) {
            return jsonResponse({ error: check.error }, 400);
          }

          if (await store.findUserByUsernameOrEmail(check.normalizedStudentId, 'student')) {
            return jsonResponse(
              {
                error:
                  'รหัสนักศึกษานี้มีบัญชีในระบบแล้ว กรุณาเข้าสู่ระบบด้วยรหัสนักศึกษาและรหัสผ่าน',
              },
              409
            );
          }

          const defaultPassword = buildDefaultStudentPassword(check.normalizedStudentId);
          const student = await store.createUser({
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
          const newToken = await signSessionWorker(student.id, sessionSecret);
          return jsonResponse(
            { user: sanitizeUser(student), token: newToken },
            200,
            { 'Set-Cookie': buildCookieHeader(request, newToken, 604800) }
          );
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/auth/student/login-id' && method === 'POST') {
        return jsonResponse(
          { error: 'เพื่อความปลอดภัย กรุณาเข้าสู่ระบบด้วยรหัสนักศึกษาและรหัสผ่าน' },
          410
        );
      }

      if (pathname === '/api/auth/student/login' && method === 'POST') {
        const authLimited = checkRateLimit(
          authRateLimiter,
          request,
          'มีการพยายามเข้าสู่ระบบหรือลงทะเบียนถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
        );
        if (authLimited) return authLimited;

        const parsed = await readJsonBody<{ studentId?: string; password?: string }>(
          request,
          512 * 1024
        );
        if (!parsed.ok) return parsed.response;

        const { studentId, password } = parsed.data;
        const idCheck = validateStudentId(studentId || '');
        if (!idCheck.valid) {
          return jsonResponse({ error: idCheck.error }, 400);
        }
        if (!password) {
          return jsonResponse({ error: 'กรุณากรอกรหัสผ่าน' }, 400);
        }
        return handlePasswordAuth(request, store, sessionSecret, {
          role: 'student',
          username: idCheck.normalized,
          password,
        });
      }

      if (pathname === '/api/auth/login' && method === 'POST') {
        const authLimited = checkRateLimit(
          authRateLimiter,
          request,
          'มีการพยายามเข้าสู่ระบบหรือลงทะเบียนถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
        );
        if (authLimited) return authLimited;

        const parsed = await readJsonBody<{
          role?: UserRole;
          username?: string;
          password?: string;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        const { role, username, password } = parsed.data;
        if (!role || !username?.trim() || !password) {
          return jsonResponse({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน' }, 400);
        }
        if (role === 'student') {
          const idCheck = validateStudentId(username);
          if (!idCheck.valid) {
            return jsonResponse({ error: idCheck.error }, 400);
          }
          return handlePasswordAuth(request, store, sessionSecret, {
            role: 'student',
            username: idCheck.normalized,
            password,
          });
        }
        return handlePasswordAuth(request, store, sessionSecret, {
          role,
          username,
          password,
        });
      }

      if (pathname === '/api/auth/change-password' && method === 'POST') {
        const roleErr = checkRole(currentUser, ['student', 'teacher', 'admin']);
        if (roleErr) return roleErr;

        const parsed = await readJsonBody<{
          currentPassword?: string;
          newPassword?: string;
          confirmPassword?: string;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const { currentPassword, newPassword, confirmPassword } = parsed.data;
          const updated = await store.changeUserPassword(currentUser!.id, {
            currentPassword: String(currentPassword ?? ''),
            newPassword: String(newPassword ?? ''),
            confirmPassword: String(confirmPassword ?? ''),
          });
          const newToken = await signSessionWorker(updated.id, sessionSecret);
          return jsonResponse(
            {
              ok: true,
              message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว',
              user: sanitizeUser(updated),
              token: newToken,
            },
            200,
            { 'Set-Cookie': buildCookieHeader(request, newToken, 604800) }
          );
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/uploads' && method === 'POST') {
        const uploadLimited = checkRateLimit(
          uploadRateLimiter,
          request,
          'มีการอัปโหลดหรือนำเข้าข้อมูลถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
        );
        if (uploadLimited) return uploadLimited;

        const roleErr = checkRole(currentUser, ['student', 'teacher', 'admin']);
        if (roleErr) return roleErr;
        const pwErr = checkPasswordChanged(currentUser);
        if (pwErr) return pwErr;

        const parsed = await readJsonBody<{
          name?: string;
          mimeType?: string;
          base64Data?: string;
        }>(request, 10 * 1024 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const { name, mimeType, base64Data } = parsed.data;
          if (!name || !mimeType || !base64Data) {
            return jsonResponse({ error: 'ข้อมูลไฟล์ไม่ครบถ้วน' }, 400);
          }
          const saved = await store.saveUploadedFileToR2({ name, mimeType, base64Data });
          return jsonResponse({ file: saved });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      // Student endpoints
      if (pathname === '/api/student/me' && method === 'GET') {
        const roleErr = checkRole(currentUser, ['student']);
        if (roleErr) return roleErr;
        const pwErr = checkPasswordChanged(currentUser);
        if (pwErr) return pwErr;

        const bundle = await store.getStudentBundle(currentUser!.id);
        if (!bundle) {
          return jsonResponse({ error: 'ไม่พบข้อมูลนักศึกษา' }, 404);
        }
        const teacherNames = await store.getTeacherNames();
        return jsonResponse({ bundle, teacherNames });
      }

      if (pathname === '/api/student/pdpa' && method === 'PUT') {
        const roleErr = checkRole(currentUser, ['student']);
        if (roleErr) return roleErr;
        const pwErr = checkPasswordChanged(currentUser);
        if (pwErr) return pwErr;

        const parsed = await readJsonBody<{ consented?: boolean }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        const basicInfo = await store.savePdpaDecision(
          currentUser!.id,
          Boolean(parsed.data.consented)
        );
        return jsonResponse({ basicInfo });
      }

      if (pathname === '/api/student/basic-info' && method === 'PUT') {
        const roleErr = checkRole(currentUser, ['student']);
        if (roleErr) return roleErr;
        const pwErr = checkPasswordChanged(currentUser);
        if (pwErr) return pwErr;

        const parsed = await readJsonBody<BasicInfoData>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const basicInfo = await store.saveBasicInfo(currentUser!.id, parsed.data);
          return jsonResponse({ basicInfo });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/student/application' && method === 'PUT') {
        const roleErr = checkRole(currentUser, ['student']);
        if (roleErr) return roleErr;
        const pwErr = checkPasswordChanged(currentUser);
        if (pwErr) return pwErr;

        const parsed = await readJsonBody<{
          application: ScholarshipApplicationData;
          submitNow?: boolean;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const saved = await store.saveApplication(
            currentUser!.id,
            parsed.data.application,
            Boolean(parsed.data.submitNow)
          );
          return jsonResponse({ application: saved });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/student/grades' && method === 'POST') {
        const roleErr = checkRole(currentUser, ['student']);
        if (roleErr) return roleErr;
        const pwErr = checkPasswordChanged(currentUser);
        if (pwErr) return pwErr;

        const parsed = await readJsonBody<{
          academicYear: AcademicYear;
          yearLevel: YearLevel;
          semester: SemesterType;
          gpa: string;
          attachments?: UploadedFileMeta[];
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const record: GradeRecord = await store.upsertGradeRecord({
            studentUserId: currentUser!.id,
            academicYear: parsed.data.academicYear,
            yearLevel: parsed.data.yearLevel,
            semester: parsed.data.semester,
            gpa: parsed.data.gpa,
            attachments: parsed.data.attachments || [],
            uploadedByRole: 'student',
            uploadedByName: currentUser!.fullName,
          });
          return jsonResponse({ grade: record });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/student/volunteers' && method === 'POST') {
        const roleErr = checkRole(currentUser, ['student']);
        if (roleErr) return roleErr;
        const pwErr = checkPasswordChanged(currentUser);
        if (pwErr) return pwErr;

        const parsed = await readJsonBody<{
          academicYear: AcademicYear;
          activityTitle: string;
          activityDetail: string;
          learnings: string;
          hours: number;
          activityDate: string;
          dailyLifeApplication: string;
          photos?: UploadedFileMeta[];
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const record = await store.addVolunteerRecord({
            studentUserId: currentUser!.id,
            academicYear: parsed.data.academicYear,
            activityTitle: parsed.data.activityTitle,
            activityDetail: parsed.data.activityDetail,
            learnings: parsed.data.learnings,
            hours: Number(parsed.data.hours),
            activityDate: parsed.data.activityDate,
            dailyLifeApplication: parsed.data.dailyLifeApplication,
            photos: parsed.data.photos || [],
          });
          return jsonResponse({ volunteer: record });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      // Staff (Teacher & Admin) endpoints
      if (pathname === '/api/staff/students' && method === 'GET') {
        const roleErr = checkRole(currentUser, ['teacher', 'admin']);
        if (roleErr) return roleErr;
        const [students, teacherNames] = await Promise.all([
          store.getAllStudentBundles(),
          store.getTeacherNames(),
        ]);
        return jsonResponse({ students, teacherNames });
      }

      if (pathname === '/api/staff/students/import' && method === 'POST') {
        const uploadLimited = checkRateLimit(
          uploadRateLimiter,
          request,
          'มีการอัปโหลดหรือนำเข้าข้อมูลถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
        );
        if (uploadLimited) return uploadLimited;

        const roleErr = checkRole(currentUser, ['teacher', 'admin']);
        if (roleErr) return roleErr;

        const parsed = await readJsonBody<{ rows?: unknown[] }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const rows = parsed.data.rows;
          if (!Array.isArray(rows) || rows.length === 0) {
            return jsonResponse({ error: 'ไม่พบข้อมูลรายชื่อสำหรับนำเข้า' }, 400);
          }
          if (rows.length > 500) {
            return jsonResponse({ error: 'นำเข้าได้สูงสุด 500 รายการต่อครั้ง' }, 400);
          }
          const result = await store.importStudentsBulk(rows as ImportedStudentRow[]);
          return jsonResponse({ result });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/staff/students' && method === 'POST') {
        const roleErr = checkRole(currentUser, ['teacher', 'admin']);
        if (roleErr) return roleErr;

        const parsed = await readJsonBody<ImportedStudentRow>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const result = await store.importStudentsBulk([parsed.data]);
          if (result.createdCount === 0 && result.updatedCount === 0) {
            return jsonResponse(
              { error: result.errors[0] || 'ไม่สามารถเพิ่มรายชื่อนักศึกษาได้' },
              400
            );
          }
          return jsonResponse({ result });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      const appReviewMatch = pathname.match(/^\/api\/staff\/applications\/([^/]+)\/review$/);
      if (appReviewMatch && method === 'PATCH') {
        const roleErr = checkRole(currentUser, ['teacher', 'admin']);
        if (roleErr) return roleErr;

        const parsed = await readJsonBody<{
          status: ApplicationStatus;
          advisorComment?: string;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const updated = await store.reviewApplication(
            decodeURIComponent(appReviewMatch[1]),
            {
              status: parsed.data.status,
              advisorComment: parsed.data.advisorComment || '',
              reviewerName: currentUser!.fullName,
            }
          );
          return jsonResponse({ application: updated });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      const volReviewMatch = pathname.match(/^\/api\/staff\/volunteers\/([^/]+)\/review$/);
      if (volReviewMatch && method === 'PATCH') {
        const roleErr = checkRole(currentUser, ['teacher', 'admin']);
        if (roleErr) return roleErr;

        const parsed = await readJsonBody<{
          approvalStatus: 'approved' | 'rejected' | 'pending';
          approvedHours?: number;
          advisorNote?: string;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const updated = await store.reviewVolunteerRecord(
            decodeURIComponent(volReviewMatch[1]),
            {
              approvalStatus: parsed.data.approvalStatus,
              approvedHours: Number(parsed.data.approvedHours || 0),
              advisorNote: parsed.data.advisorNote || '',
              reviewerName: currentUser!.fullName,
            }
          );
          return jsonResponse({ volunteer: updated });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      const staffGradeMatch = pathname.match(/^\/api\/staff\/grades\/([^/]+)$/);
      if (staffGradeMatch && method === 'POST') {
        const roleErr = checkRole(currentUser, ['teacher', 'admin']);
        if (roleErr) return roleErr;

        const parsed = await readJsonBody<{
          academicYear: AcademicYear;
          yearLevel: YearLevel;
          semester: SemesterType;
          gpa: string;
          attachments?: UploadedFileMeta[];
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const record = await store.upsertGradeRecord({
            studentUserId: decodeURIComponent(staffGradeMatch[1]),
            academicYear: parsed.data.academicYear,
            yearLevel: parsed.data.yearLevel,
            semester: parsed.data.semester,
            gpa: parsed.data.gpa,
            attachments: parsed.data.attachments || [],
            uploadedByRole: currentUser!.role,
            uploadedByName: currentUser!.fullName,
          });
          return jsonResponse({ grade: record });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      // Admin endpoints
      if (pathname === '/api/admin/users' && method === 'GET') {
        const roleErr = checkRole(currentUser, ['admin']);
        if (roleErr) return roleErr;
        const users = await store.getUsers();
        return jsonResponse({ users: users.map(sanitizeUser) });
      }

      const adminResetPwMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
      if (adminResetPwMatch && method === 'PATCH') {
        const roleErr = checkRole(currentUser, ['admin']);
        if (roleErr) return roleErr;

        if (!canResetUserPassword(currentUser!.role)) {
          return jsonResponse({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, 403);
        }

        const parsed = await readJsonBody<{
          resetToDefault?: boolean;
          newPassword?: string;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const updated = await store.resetUserPassword(
            decodeURIComponent(adminResetPwMatch[1]),
            {
              resetToDefault: Boolean(parsed.data.resetToDefault),
              newPassword: parsed.data.newPassword,
            }
          );
          return jsonResponse({
            user: sanitizeUser(updated),
            message:
              updated.role === 'student'
                ? 'รีเซ็ตรหัสผ่านนักศึกษาเรียบร้อยแล้ว นักศึกษาจะต้องเปลี่ยนรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งถัดไป'
                : 'แก้ไขรหัสผ่านเรียบร้อยแล้ว',
          });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/admin/users' && method === 'POST') {
        const roleErr = checkRole(currentUser, ['admin']);
        if (roleErr) return roleErr;

        const parsed = await readJsonBody<{
          role?: UserRole;
          username?: string;
          password?: string;
          fullName?: string;
          studentId?: string;
        }>(request, 512 * 1024);
        if (!parsed.ok) return parsed.response;

        try {
          const { role, username, password, fullName, studentId } = parsed.data;
          if (!role || (!username?.trim() && !studentId?.trim())) {
            return jsonResponse({ error: 'กรุณากรอกข้อมูลบัญชีผู้ใช้งานให้ครบถ้วน' }, 400);
          }

          if (role === 'student') {
            const idCheck = validateStudentId(studentId || username || '');
            if (!idCheck.valid) {
              return jsonResponse({ error: idCheck.error }, 400);
            }
            const cleanCustomPw = password?.trim();
            if (cleanCustomPw && cleanCustomPw.length < 4) {
              return jsonResponse({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' }, 400);
            }
            const user = await store.createUser({
              role: 'student',
              username: idCheck.normalized.toLowerCase(),
              password: cleanCustomPw || buildDefaultStudentPassword(idCheck.normalized),
              fullName: fullName?.trim() || `นักศึกษา ${idCheck.normalized}`,
              studentId: idCheck.normalized,
              mustChangePassword: true,
              authProvider: 'password',
            });
            return jsonResponse({ user: sanitizeUser(user) });
          }

          if (!password || password.length < 4) {
            return jsonResponse({ error: 'กรุณากรอกรหัสผ่านอย่างน้อย 4 ตัวอักษร' }, 400);
          }

          const user = await store.createUser({
            role,
            username: username!.trim(),
            password,
            fullName: fullName?.trim() || username!.trim(),
            mustChangePassword: false,
            authProvider: 'password',
          });
          return jsonResponse({ user: sanitizeUser(user) });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      const adminDeleteMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (adminDeleteMatch && method === 'DELETE') {
        const roleErr = checkRole(currentUser, ['admin']);
        if (roleErr) return roleErr;

        try {
          const targetId = decodeURIComponent(adminDeleteMatch[1]).trim();
          const targetUser = await store.findUserById(targetId);
          if (!targetUser) {
            return jsonResponse({ error: 'ไม่พบบัญชีผู้ใช้งาน' }, 404);
          }
          const allUsers = await store.getUsers();
          const adminCount = allUsers.filter((u) => u.role === 'admin').length;
          const check = canDeleteUserAccount({
            actorRole: currentUser!.role,
            actorUserId: currentUser!.id,
            targetUserId: targetUser.id,
            targetRole: targetUser.role,
            adminCount,
          });
          if (!check.allowed) {
            return jsonResponse(
              { error: check.reason || 'ไม่สามารถลบบัญชีผู้ใช้งานนี้ได้' },
              400
            );
          }
          const deleted = await store.deleteUser(targetUser.id);
          return jsonResponse({ deletedUser: sanitizeUser(deleted) });
        } catch (err) {
          return jsonResponse({ error: (err as Error).message }, 400);
        }
      }

      if (pathname === '/api/workspace/config' && method === 'GET') {
        const roleErr = checkRole(currentUser, ['student', 'teacher', 'admin']);
        if (roleErr) return roleErr;
        return jsonResponse({ config: await store.getWorkspaceConfig() });
      }

      if (pathname === '/api/workspace/config' && method === 'PUT') {
        const roleErr = checkRole(currentUser, ['teacher', 'admin']);
        if (roleErr) return roleErr;
        const parsed = await readJsonBody<Record<string, unknown>>(request, 64 * 1024);
        if (!parsed.ok) return parsed.response;
        const config = await store.saveWorkspaceConfig(parsed.data);
        return jsonResponse({ config });
      }

      if (pathname === '/api/admin/apps-script-template' && method === 'GET') {
        const roleErr = checkRole(currentUser, ['admin', 'teacher']);
        if (roleErr) return roleErr;
        return jsonResponse({ code: APPS_SCRIPT_TEMPLATE });
      }

      return jsonResponse({ error: 'ไม่พบ API ที่ร้องขอ' }, 404);
    } catch (err) {
      console.error('[cloudflare worker error]', err);
      return jsonResponse({ error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง' }, 500);
    }
  },
};
