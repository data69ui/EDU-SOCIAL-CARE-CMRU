import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import worker from './index.js';
import type {
  CloudflareEnv,
  D1Database,
  D1PreparedStatement,
  D1Result,
  R2Bucket,
  R2Object,
  R2ObjectBody,
  R2PutOptions,
} from './types.js';

interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (filename: string) => SqliteDatabase;
};

function createSqliteD1Mock(): { db: D1Database; close: () => void } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const migrationSql = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations/0001_init.sql'),
    'utf8'
  );
  sqlite.exec(migrationSql);

  const normalizeBindings = (values: unknown[]) =>
    values.map((v) => (v === undefined ? null : v));

  class SqliteD1Statement implements D1PreparedStatement {
    private bindings: unknown[] = [];

    constructor(private readonly query: string) {}

    bind(...values: unknown[]): D1PreparedStatement {
      this.bindings = normalizeBindings(values);
      return this;
    }

    async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
      const stmt = sqlite.prepare(this.query);
      const row = stmt.get(...this.bindings);
      if (!row) return null;
      if (colName) {
        return (row[colName] as T) ?? null;
      }
      return row as T;
    }

    async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      const stmt = sqlite.prepare(this.query);
      const info = stmt.run(...this.bindings);
      return {
        results: [],
        success: true,
        meta: {
          changed_db: Number(info.changes) > 0,
          changes: Number(info.changes),
          last_row_id: Number(info.lastInsertRowid),
        },
      };
    }

    async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      const stmt = sqlite.prepare(this.query);
      const rows = stmt.all(...this.bindings) as T[];
      return {
        results: rows,
        success: true,
        meta: { rows_read: rows.length },
      };
    }

    async raw<T = unknown[]>(): Promise<T[]> {
      const rows = sqlite.prepare(this.query).all(...this.bindings);
      return rows.map((r) => Object.values(r)) as T[];
    }
  }

  const db: D1Database = {
    prepare(query: string) {
      return new SqliteD1Statement(query);
    },
    async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]) {
      const results: D1Result<T>[] = [];
      sqlite.exec('BEGIN TRANSACTION;');
      try {
        for (const stmt of statements) {
          results.push(await stmt.run<T>());
        }
        sqlite.exec('COMMIT;');
      } catch (err) {
        sqlite.exec('ROLLBACK;');
        throw err;
      }
      return results;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },
  };

  return { db, close: () => sqlite.close() };
}

function createMemoryR2Mock(): R2Bucket {
  const objects = new Map<
    string,
    { bytes: Uint8Array; metadata?: R2PutOptions['httpMetadata'] }
  >();

  return {
    async put(key, value, options): Promise<R2Object | null> {
      let bytes: Uint8Array;
      if (value instanceof Uint8Array) {
        bytes = new Uint8Array(value);
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
      } else if (ArrayBuffer.isView(value)) {
        bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      } else if (typeof value === 'string') {
        bytes = new TextEncoder().encode(value);
      } else if (value instanceof Blob) {
        bytes = new Uint8Array(await value.arrayBuffer());
      } else {
        bytes = new Uint8Array(await new Response(value).arrayBuffer());
      }
      objects.set(key, { bytes, metadata: options?.httpMetadata });
      return {
        key,
        size: bytes.length,
        etag: `"${key}"`,
        httpMetadata: options?.httpMetadata,
      };
    },

    async get(key): Promise<R2ObjectBody | null> {
      const entry = objects.get(key);
      if (!entry) return null;
      const copy = new Uint8Array(entry.bytes);
      return {
        key,
        size: copy.length,
        etag: `"${key}"`,
        httpMetadata: entry.metadata,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(copy);
            controller.close();
          },
        }),
        async arrayBuffer() {
          return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
        },
      };
    },

    async delete(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) objects.delete(k);
    },
  };
}

function createTestEnv(): { env: CloudflareEnv; close: () => void } {
  const sqlite = createSqliteD1Mock();
  const bucket = createMemoryR2Mock();
  return {
    env: {
      DB: sqlite.db,
      BUCKET: bucket,
      SESSION_SECRET: 'test-cloudflare-worker-session-secret-0123456789abcdef',
      ASSETS: {
        async fetch() {
          return new Response('<html>SPA Shell</html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        },
      },
    },
    close: sqlite.close,
  };
}

async function reqJson(
  env: CloudflareEnv,
  urlPath: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    origin?: string;
    ip?: string;
    omitCsrfHeaders?: boolean;
  } = {}
) {
  const method = options.method || 'GET';
  const headers = new Headers();
  if (options.ip) headers.set('cf-connecting-ip', options.ip);
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (!options.omitCsrfHeaders && method !== 'GET' && method !== 'HEAD') {
    headers.set('Origin', options.origin || 'https://cmru-care.workers.dev');
  }
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const request = new Request(`https://cmru-care.workers.dev${urlPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const response = await worker.fetch(request, env);
  const json = (await response.json().catch(() => ({}))) as Record<string, any>;
  return { response, json };
}

test('Cloudflare Worker + D1 + R2 full end-to-end flow', async (t) => {
  const { env, close } = createTestEnv();
  t.after(close);

  // 1. Initial clean state check
  const health = await reqJson(env, '/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.json.runtime, 'cloudflare-workers');

  const initStatus = await reqJson(env, '/api/auth/status');
  assert.equal(initStatus.response.status, 200);
  assert.equal(initStatus.json.adminInitialized, false);

  const emptyOverview = await reqJson(env, '/api/public/overview');
  assert.equal(emptyOverview.response.status, 200);
  assert.equal(emptyOverview.json.overview.totalAllStudents, 0);

  // 2. CSRF protection on state-changing request without Origin / X-Requested-With / Bearer
  const csrfBlocked = await reqJson(env, '/api/auth/admin/setup', {
    method: 'POST',
    omitCsrfHeaders: true,
    body: {
      username: 'admin1',
      password: 'Password123',
      confirmPassword: 'Password123',
    },
  });
  assert.equal(csrfBlocked.response.status, 403);

  // 3. First-time admin setup
  const setupRes = await reqJson(env, '/api/auth/admin/setup', {
    method: 'POST',
    body: {
      fullName: 'ผู้ดูแลระบบสังคมศึกษา',
      username: 'admin.social',
      password: 'AdminPass2026!',
      confirmPassword: 'AdminPass2026!',
    },
  });
  assert.equal(setupRes.response.status, 200);
  assert.equal(setupRes.json.user.role, 'admin');
  assert.ok(setupRes.json.token);
  const setCookieHeader = setupRes.response.headers.get('set-cookie') || '';
  assert.match(setCookieHeader, /HttpOnly/);
  assert.match(setCookieHeader, /SameSite=None; Secure; Partitioned/);

  // Second admin setup must fail
  const duplicateSetup = await reqJson(env, '/api/auth/admin/setup', {
    method: 'POST',
    body: {
      username: 'admin2',
      password: 'AdminPass2026!',
      confirmPassword: 'AdminPass2026!',
    },
  });
  assert.equal(duplicateSetup.response.status, 400);

  // 4. Admin login + lockout test (separate IP for lockout test)
  for (let i = 0; i < 4; i++) {
    const wrong = await reqJson(env, '/api/auth/login', {
      method: 'POST',
      ip: '198.51.100.20',
      body: { role: 'admin', username: 'admin.social', password: 'WrongPassword' },
    });
    assert.equal(wrong.response.status, 401);
  }
  const fifthWrong = await reqJson(env, '/api/auth/login', {
    method: 'POST',
    ip: '198.51.100.20',
    body: { role: 'admin', username: 'admin.social', password: 'WrongPassword' },
  });
  assert.equal(fifthWrong.response.status, 429);

  // Reset admin lock by waiting? Instead create teacher via admin token from step 3
  const adminToken = setupRes.json.token as string;

  // Admin creates teacher account
  const teacherCreate = await reqJson(env, '/api/admin/users', {
    method: 'POST',
    token: adminToken,
    body: {
      role: 'teacher',
      username: 'ajarn.somchai',
      password: 'TeacherPass2026',
      fullName: 'ผศ.ดร.สมชาย ใจดี',
    },
  });
  assert.equal(teacherCreate.response.status, 200);
  assert.equal(teacherCreate.json.user.role, 'teacher');

  const teacherLogin = await reqJson(env, '/api/auth/login', {
    method: 'POST',
    ip: '198.51.100.21',
    body: { role: 'teacher', username: 'ajarn.somchai', password: 'TeacherPass2026' },
  });
  assert.equal(teacherLogin.response.status, 200);
  const teacherToken = teacherLogin.json.token as string;

  // 5. Bulk student import into D1
  const importRes = await reqJson(env, '/api/staff/students/import', {
    method: 'POST',
    token: teacherToken,
    body: {
      rows: [
        {
          studentId: '68141101',
          fullName: 'นางสาวณัฐธิดา สุขใจ',
          email: '68141101@cmru.ac.th',
          academicYear: '2569',
          yearLevel: 'ปี 2',
          gpax: '3.65',
          hasStudentLoan: 'กู้',
        },
        {
          studentId: 'bad',
          fullName: 'ไม่ครบ',
        },
      ],
    },
  });
  assert.equal(importRes.response.status, 200);
  assert.equal(importRes.json.result.createdCount, 1);
  assert.equal(importRes.json.result.skippedCount, 1);

  // 6. Student login with default password (studentId) -> forced password change
  const stuLogin = await reqJson(env, '/api/auth/student/login', {
    method: 'POST',
    ip: '198.51.100.30',
    body: { studentId: '68141101', password: '68141101' },
  });
  assert.equal(stuLogin.response.status, 200);
  assert.equal(stuLogin.json.user.mustChangePassword, true);
  const studentToken = stuLogin.json.token as string;
  const studentUserId = stuLogin.json.user.id as string;

  const blockedMe = await reqJson(env, '/api/student/me', { token: studentToken });
  assert.equal(blockedMe.response.status, 403);
  assert.equal(blockedMe.json.code, 'PASSWORD_CHANGE_REQUIRED');

  const changePw = await reqJson(env, '/api/auth/change-password', {
    method: 'POST',
    token: studentToken,
    body: {
      currentPassword: '68141101',
      newPassword: 'StudentNew2026!',
      confirmPassword: 'StudentNew2026!',
    },
  });
  assert.equal(changePw.response.status, 200);
  assert.equal(changePw.json.user.mustChangePassword, false);
  const updatedStudentToken = changePw.json.token as string;

  // 7. Student saves PDPA, BasicInfo with multiple scholarships, and submits Application
  const pdpaRes = await reqJson(env, '/api/student/pdpa', {
    method: 'PUT',
    token: updatedStudentToken,
    body: { consented: true },
  });
  assert.equal(pdpaRes.response.status, 200);
  assert.equal(pdpaRes.json.basicInfo.pdpaConsented, true);

  const meRes = await reqJson(env, '/api/student/me', { token: updatedStudentToken });
  assert.equal(meRes.response.status, 200);
  assert.deepEqual(meRes.json.teacherNames, ['ผศ.ดร.สมชาย ใจดี']);

  const basicUpdate = await reqJson(env, '/api/student/basic-info', {
    method: 'PUT',
    token: updatedStudentToken,
    body: {
      ...meRes.json.bundle.basicInfo,
      isDraft: false,
      phone: '0812345678',
      gpax: '3.72',
      hasOtherScholarship: 'ได้รับทุน',
      receivedScholarships: [
        { id: 's1', name: 'ทุน กสศ.', provider: 'กสศ.', amount: '24000', receivedDate: '2568' },
        { id: 's2', name: 'ทุนครุศาสตร์', provider: 'คณะครุศาสตร์', amount: '5000', receivedDate: '2569' },
      ],
    },
  });
  assert.equal(basicUpdate.response.status, 200);
  assert.equal(basicUpdate.json.basicInfo.receivedScholarships.length, 2);

  const submitApp = await reqJson(env, '/api/student/application', {
    method: 'PUT',
    token: updatedStudentToken,
    body: {
      submitNow: true,
      application: {
        academicYear: '2569',
        yearLevel: 'ปี 2',
        gpax: '3.72',
        monthlyIncome: '4500',
        reasonText: 'ครอบครัวมีรายได้น้อย ต้องการทุนสนับสนุนค่าเล่าเรียน',
      },
    },
  });
  assert.equal(submitApp.response.status, 200);
  assert.equal(submitApp.json.application.status, 'submitted');

  // Volunteer blocked before application approval
  const blockedVol = await reqJson(env, '/api/student/volunteers', {
    method: 'POST',
    token: updatedStudentToken,
    body: {
      academicYear: '2569',
      activityTitle: 'ช่วยงานห้องสมุด',
      activityDetail: 'จัดหนังสือ',
      learnings: 'ฝึกความรับผิดชอบ',
      hours: 4,
      activityDate: '2026-08-10',
      dailyLifeApplication: 'จัดระเบียบเวลา',
      photos: [],
    },
  });
  assert.equal(blockedVol.response.status, 400);

  // 8. Teacher approves application, then student uploads PNG to R2 & records volunteer + grade
  const approveApp = await reqJson(env, `/api/staff/applications/${studentUserId}/review`, {
    method: 'PATCH',
    token: teacherToken,
    body: { status: 'approved', advisorComment: 'สมควรได้รับทุนต่อเนื่อง' },
  });
  assert.equal(approveApp.response.status, 200);
  assert.equal(approveApp.json.application.status, 'approved');

  // Valid 1x1 PNG magic bytes
  const pngBytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const pngB64 = Buffer.from(pngBytes).toString('base64');

  const uploadRes = await reqJson(env, '/api/uploads', {
    method: 'POST',
    token: updatedStudentToken,
    body: {
      name: 'volunteer-proof.png',
      mimeType: 'image/png',
      base64Data: `data:image/png;base64,${pngB64}`,
    },
  });
  assert.equal(uploadRes.response.status, 200);
  assert.match(uploadRes.json.file.url, /^\/uploads\/.+\.png$/);

  // Fetch file back from R2 via /uploads/:filename
  const r2GetRes = await worker.fetch(
    new Request(`https://cmru-care.workers.dev${uploadRes.json.file.url}`),
    env
  );
  assert.equal(r2GetRes.status, 200);
  assert.equal(r2GetRes.headers.get('content-type'), 'image/png');
  assert.equal(r2GetRes.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r2GetRes.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  const fetchedBuf = new Uint8Array(await r2GetRes.arrayBuffer());
  assert.deepEqual(fetchedBuf, pngBytes);

  // Path traversal rejected on /uploads/
  const traversalRes = await worker.fetch(
    new Request('https://cmru-care.workers.dev/uploads/..%2Fsecret.txt'),
    env
  );
  assert.equal(traversalRes.status, 400);

  // Volunteer submit + approve
  const addVol = await reqJson(env, '/api/student/volunteers', {
    method: 'POST',
    token: updatedStudentToken,
    body: {
      academicYear: '2569',
      activityTitle: 'จิตอาสาจัดนิทรรศการสังคมศึกษา',
      activityDetail: 'ช่วยจัดบอร์ดวิชาการ',
      learnings: 'ทำงานร่วมกับผู้อื่น',
      hours: 6,
      activityDate: '2026-08-12',
      dailyLifeApplication: 'สื่อสารอย่างสร้างสรรค์',
      photos: [uploadRes.json.file],
    },
  });
  assert.equal(addVol.response.status, 200);

  const approveVol = await reqJson(env, `/api/staff/volunteers/${addVol.json.volunteer.id}/review`, {
    method: 'PATCH',
    token: teacherToken,
    body: {
      approvalStatus: 'approved',
      approvedHours: 6,
      advisorNote: 'รับรองเรียบร้อย',
    },
  });
  assert.equal(approveVol.response.status, 200);
  assert.equal(approveVol.json.volunteer.approvedHours, 6);

  // Grade upsert (insert + update same semester)
  const grade1 = await reqJson(env, '/api/student/grades', {
    method: 'POST',
    token: updatedStudentToken,
    body: {
      academicYear: '2569',
      yearLevel: 'ปี 2',
      semester: 'ภาคเรียนที่ 1',
      gpa: '3.70',
      attachments: [uploadRes.json.file],
    },
  });
  assert.equal(grade1.response.status, 200);
  assert.equal(grade1.json.grade.gpa, '3.70');

  const gradeUpsert = await reqJson(env, '/api/student/grades', {
    method: 'POST',
    token: updatedStudentToken,
    body: {
      academicYear: '2569',
      yearLevel: 'ปี 2',
      semester: 'ภาคเรียนที่ 1',
      gpa: '3.82',
      attachments: [uploadRes.json.file],
    },
  });
  assert.equal(gradeUpsert.response.status, 200);
  assert.equal(gradeUpsert.json.grade.id, grade1.json.grade.id);
  assert.equal(gradeUpsert.json.grade.gpa, '3.82');

  // 9. Verify Public Overview reflects D1 data accurately
  const publicOverview = await reqJson(env, '/api/public/overview');
  assert.equal(publicOverview.response.status, 200);
  assert.equal(publicOverview.json.overview.totalAllStudents, 1);
  assert.equal(publicOverview.json.overview.approvedCount, 1);
  assert.equal(publicOverview.json.overview.approvedVolunteerHours, 6);
  assert.equal(publicOverview.json.overview.gradeRecordsCount, 1);
  assert.equal(publicOverview.json.overview.scholarshipSummary.length, 2);

  // 10. RBAC & cascade delete check (create a second admin first? No, test deleting student succeeds and deleting last admin fails)
  const studentCannotAccessAdmin = await reqJson(env, '/api/admin/users', {
    token: updatedStudentToken,
  });
  assert.equal(studentCannotAccessAdmin.response.status, 403);

  const deleteLastAdmin = await reqJson(env, `/api/admin/users/${setupRes.json.user.id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(deleteLastAdmin.response.status, 400);

  // 10b. Google Workspace config RBAC & URL sanitization check
  const guestWorkspaceCfg = await reqJson(env, '/api/workspace/config');
  assert.equal(guestWorkspaceCfg.response.status, 401);

  const studentForbiddenWorkspaceSave = await reqJson(env, '/api/workspace/config', {
    method: 'PUT',
    token: updatedStudentToken,
    body: { spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz' },
  });
  assert.equal(studentForbiddenWorkspaceSave.response.status, 403);

  const teacherSaveWorkspaceCfg = await reqJson(env, '/api/workspace/config', {
    method: 'PUT',
    token: teacherToken,
    body: {
      spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
      spreadsheetTitle: 'CMRU Scholarship DB',
      spreadsheetUrl: 'javascript:alert(1)',
      driveFolderId: '0Bw1234567890AbCdEfGhIjK',
      driveFolderName: 'CMRU Files',
      driveFolderUrl: 'https://drive.google.com/drive/folders/0Bw1234567890AbCdEfGhIjK',
    },
  });
  assert.equal(teacherSaveWorkspaceCfg.response.status, 200);
  assert.equal(
    teacherSaveWorkspaceCfg.json.config.spreadsheetUrl,
    'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz'
  );
  assert.equal(
    teacherSaveWorkspaceCfg.json.config.driveFolderId,
    '0Bw1234567890AbCdEfGhIjK'
  );

  const studentGetWorkspaceCfg = await reqJson(env, '/api/workspace/config', {
    token: updatedStudentToken,
  });
  assert.equal(studentGetWorkspaceCfg.response.status, 200);
  assert.equal(
    studentGetWorkspaceCfg.json.config.driveFolderId,
    '0Bw1234567890AbCdEfGhIjK'
  );

  const deleteStudent = await reqJson(env, `/api/admin/users/${studentUserId}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(deleteStudent.response.status, 200);

  const postDeleteOverview = await reqJson(env, '/api/public/overview');
  assert.equal(postDeleteOverview.json.overview.totalAllStudents, 0);

  // 11. SPA assets fallback check
  const spaRes = await worker.fetch(
    new Request('https://cmru-care.workers.dev/dashboard'),
    env
  );
  assert.equal(spaRes.status, 200);
  assert.match(await spaRes.text(), /SPA Shell/);
});
