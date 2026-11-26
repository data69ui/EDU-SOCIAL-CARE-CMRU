import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AcademicYear,
  ApplicationStatus,
  BasicInfoData,
  GradeRecord,
  GoogleWorkspaceConfig,
  ImportedStudentRow,
  ImportStudentsResult,
  PublicOverviewStats,
  ScholarshipApplicationData,
  SemesterType,
  StudentFullRecord,
  UploadedFileMeta,
  UserAccount,
  UserRole,
  VolunteerRecord,
  YearLevel,
} from '../src/types/scholarship.js';
import {
  buildDefaultStudentPassword,
  buildPublicOverviewStats,
  createEmptyBasicInfo,
  evaluateLoginAttemptStatus,
  normalizeExcelAcademicYear,
  normalizeExcelLoanStatus,
  normalizeExcelYearLevel,
  prefillApplicationFromBasicInfo,
  recordFailedAttemptState,
  sanitizeReceivedScholarships,
  validatePasswordChangePayload,
  validateStrongPassword,
  validateStudentId,
} from '../src/utils/scholarshipLogic.js';
import {
  clampPayloadText,
  MAX_SERVER_UPLOAD_BYTES,
  sanitizeWorkspaceConfigInput,
  validateUploadedBinary,
} from '../src/utils/securityGuard.js';

export interface StoredUser extends UserAccount {
  passwordHash?: string;
}

export interface DatabaseState {
  adminInitialized: boolean;
  users: StoredUser[];
  basicInfos: Record<string, BasicInfoData>;
  applications: Record<string, ScholarshipApplicationData>;
  grades: GradeRecord[];
  volunteers: VolunteerRecord[];
  workspaceConfig?: GoogleWorkspaceConfig;
}

const IS_VERCEL = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION
);
const REMOTE_STATE_KEY = 'cmru_edu_social_care:db_state';
const REMOTE_SECRET_KEY = 'cmru_edu_social_care:session_secret';
const REMOTE_UPLOAD_PREFIX = 'cmru_edu_social_care:upload:';

function resolveWritableDirs(): {
  dataDir: string;
  uploadsDir: string;
  dbFile: string;
  dbBackupFile: string;
} {
  const candidates = IS_VERCEL
    ? [path.join(os.tmpdir(), 'cmru-edu-social-care-data')]
    : [
        path.resolve(process.cwd(), 'data'),
        path.join(os.tmpdir(), 'cmru-edu-social-care-data'),
      ];

  for (const dir of candidates) {
    try {
      const uploads = path.join(dir, 'uploads');
      fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(uploads, { recursive: true });
      return {
        dataDir: dir,
        uploadsDir: uploads,
        dbFile: path.join(dir, 'db.json'),
        dbBackupFile: path.join(dir, 'db.backup.json'),
      };
    } catch {
      // Fall back to /tmp on read-only filesystems (e.g. EROFS / EACCES)
    }
  }

  const fallback = path.join(os.tmpdir(), 'cmru-edu-social-care-data');
  const uploads = path.join(fallback, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  return {
    dataDir: fallback,
    uploadsDir: uploads,
    dbFile: path.join(fallback, 'db.json'),
    dbBackupFile: path.join(fallback, 'db.backup.json'),
  };
}

const RESOLVED_DIRS = resolveWritableDirs();
const UPLOADS_DIR = RESOLVED_DIRS.uploadsDir;
const DB_FILE = RESOLVED_DIRS.dbFile;
const DB_BACKUP_FILE = RESOLVED_DIRS.dbBackupFile;

function sanitizePayloadValue<T>(val: T, depth = 0): T {
  if (depth > 6) return val;
  if (typeof val === 'string') {
    return clampPayloadText(val, 4000) as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.slice(0, 100).map((item) => sanitizePayloadValue(item, depth + 1)) as unknown as T;
  }
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitizePayloadValue(v, depth + 1);
    }
    return out as T;
  }
  return val;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function sanitizeUser(user: StoredUser): UserAccount {
  const { passwordHash: _ignored, ...rest } = user;
  return rest;
}

function createEmptyState(): DatabaseState {
  return {
    adminInitialized: false,
    users: [],
    basicInfos: {},
    applications: {},
    grades: [],
    volunteers: [],
  };
}

class FileStore {
  private state: DatabaseState;
  private initializedRemote = false;
  private lastRemoteSyncAt = 0;
  private pendingRemotePersist: Promise<void> = Promise.resolve();
  private runtimeSessionSecret: string | null = null;

  constructor() {
    fs.mkdirSync(RESOLVED_DIRS.dataDir, { recursive: true });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const loaded = this.tryReadJson(DB_FILE) || this.tryReadJson(DB_BACKUP_FILE);
    if (loaded) {
      this.state = loaded;
    } else {
      this.state = createEmptyState();
      if (!this.getRemoteConfig()) {
        this.persistLocalOnly();
      }
    }
    this.migrateLegacyStudentPasswords();
  }

  private getRemoteConfig(): { url: string; token: string } | null {
    const url = (
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');
    const token = (
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      ''
    ).trim();
    if (!url || !token) return null;
    return { url, token };
  }

  private async remoteGet(key: string): Promise<string | null> {
    const cfg = this.getRemoteConfig();
    if (!cfg) return null;
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) {
      throw new Error(`Remote KV GET failed (${res.status})`);
    }
    const json = (await res.json()) as { result?: unknown };
    return typeof json.result === 'string' ? json.result : null;
  }

  private async remoteSet(key: string, value: string): Promise<void> {
    const cfg = this.getRemoteConfig();
    if (!cfg) return;
    const res = await fetch(`${cfg.url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: value,
    });
    if (!res.ok) {
      throw new Error(`Remote KV SET failed (${res.status})`);
    }
  }

  async ready(forceRefresh = false): Promise<void> {
    const cfg = this.getRemoteConfig();
    if (!cfg) {
      if (!this.runtimeSessionSecret) {
        this.runtimeSessionSecret =
          process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
      }
      return;
    }

    const stale = Date.now() - this.lastRemoteSyncAt > 1500;
    if (!forceRefresh && this.initializedRemote && !stale) {
      return;
    }

    await this.pendingRemotePersist.catch(() => {});

    try {
      const raw = await this.remoteGet(REMOTE_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DatabaseState>;
        if (parsed && Array.isArray(parsed.users)) {
          const users = parsed.users;
          const hasAdmin = users.some((u) => u.role === 'admin');
          this.state = {
            adminInitialized: Boolean(parsed.adminInitialized) && hasAdmin,
            users,
            basicInfos: parsed.basicInfos || {},
            applications: parsed.applications || {},
            grades: Array.isArray(parsed.grades) ? parsed.grades : [],
            volunteers: Array.isArray(parsed.volunteers) ? parsed.volunteers : [],
          };
          this.persistLocalOnly();
        }
      } else if (!this.initializedRemote) {
        await this.remoteSet(REMOTE_STATE_KEY, JSON.stringify(this.state));
      }

      if (!process.env.SESSION_SECRET && !this.runtimeSessionSecret) {
        const remoteSecret = await this.remoteGet(REMOTE_SECRET_KEY);
        if (remoteSecret && remoteSecret.length >= 32) {
          this.runtimeSessionSecret = remoteSecret;
        } else {
          const generated = crypto.randomBytes(32).toString('hex');
          this.runtimeSessionSecret = generated;
          await this.remoteSet(REMOTE_SECRET_KEY, generated);
        }
      } else if (process.env.SESSION_SECRET) {
        this.runtimeSessionSecret = process.env.SESSION_SECRET;
      }

      this.initializedRemote = true;
      this.lastRemoteSyncAt = Date.now();
    } catch (err) {
      console.error('[store.ready remote sync error]', err);
      if (!this.runtimeSessionSecret) {
        this.runtimeSessionSecret =
          process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
      }
    }
  }

  getRuntimeSessionSecret(): string {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    if (!this.runtimeSessionSecret) {
      this.runtimeSessionSecret = crypto.randomBytes(32).toString('hex');
    }
    return this.runtimeSessionSecret;
  }

  async flush(): Promise<void> {
    await this.pendingRemotePersist;
  }

  private tryReadJson(filePath: string): DatabaseState | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseState>;
      if (!parsed || !Array.isArray(parsed.users)) return null;
      const users = parsed.users;
      const hasAdmin = users.some((u) => u.role === 'admin');
      return {
        adminInitialized: Boolean(parsed.adminInitialized) && hasAdmin,
        users,
        basicInfos: parsed.basicInfos || {},
        applications: parsed.applications || {},
        grades: Array.isArray(parsed.grades) ? parsed.grades : [],
        volunteers: Array.isArray(parsed.volunteers) ? parsed.volunteers : [],
      };
    } catch {
      return null;
    }
  }

  private migrateLegacyStudentPasswords() {
    let changed = false;
    for (const user of this.state.users) {
      if (user.role === 'student' && !user.passwordHash) {
        const sid = (user.studentId || user.username || '').trim();
        const defaultPw = buildDefaultStudentPassword(sid);
        if (defaultPw) {
          user.passwordHash = hashPassword(defaultPw);
          user.hasPassword = true;
          user.mustChangePassword = true;
          user.failedLoginAttempts = 0;
          user.lockedUntil = undefined;
          changed = true;
        }
      }
    }
    if (changed) {
      this.persistLocalOnly();
    }
  }

  private persistLocalOnly() {
    const serialized = JSON.stringify(this.state, null, 2);
    fs.mkdirSync(RESOLVED_DIRS.dataDir, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      try {
        const existingRaw = fs.readFileSync(DB_FILE, 'utf-8');
        JSON.parse(existingRaw);
        const backupTmp = `${DB_BACKUP_FILE}.tmp`;
        fs.writeFileSync(backupTmp, existingRaw, 'utf-8');
        fs.renameSync(backupTmp, DB_BACKUP_FILE);
      } catch {
        // Ignore invalid prior snapshot
      }
    }
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, serialized, 'utf-8');
    fs.renameSync(tmp, DB_FILE);
  }

  private persist() {
    this.persistLocalOnly();
    if (this.getRemoteConfig()) {
      const snapshot = JSON.stringify(this.state);
      this.pendingRemotePersist = this.pendingRemotePersist
        .catch(() => {})
        .then(() => this.remoteSet(REMOTE_STATE_KEY, snapshot))
        .then(() => {
          this.lastRemoteSyncAt = Date.now();
        });
    }
  }

  getUploadsDir() {
    return UPLOADS_DIR;
  }

  isAdminInitialized(): boolean {
    return this.state.adminInitialized && this.state.users.some((u) => u.role === 'admin');
  }

  getUsers(): StoredUser[] {
    return this.state.users;
  }

  findUserById(id: string): StoredUser | undefined {
    return this.state.users.find((u) => u.id === id);
  }

  findUserByUsernameOrEmail(identifier: string, role?: UserRole): StoredUser | undefined {
    const normalized = identifier.trim().toLowerCase();
    return this.state.users.find((u) => {
      if (role && u.role !== role) return false;
      return (
        u.username.toLowerCase() === normalized ||
        (u.email && u.email.toLowerCase() === normalized) ||
        (u.studentId && u.studentId.toLowerCase() === normalized)
      );
    });
  }

  createFirstAdmin(params: { username: string; password: string; fullName: string }): StoredUser {
    if (this.state.adminInitialized) {
      throw new Error('ระบบผู้ดูแลระบบได้ถูกตั้งค่าครั้งแรกเรียบร้อยแล้ว');
    }
    const username = params.username.trim().toLowerCase();
    const existing = this.findUserByUsernameOrEmail(username);
    if (existing) {
      throw new Error('ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว');
    }
    const admin: StoredUser = {
      id: `usr_admin_${Date.now()}`,
      role: 'admin',
      username,
      fullName: params.fullName.trim() || 'ผู้ดูแลระบบงานทุนการศึกษา',
      authProvider: 'password',
      hasPassword: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      passwordHash: hashPassword(params.password),
      createdAt: new Date().toISOString(),
    };
    this.state.users.push(admin);
    this.state.adminInitialized = true;
    this.persist();
    return admin;
  }

  createUser(params: {
    role: UserRole;
    username: string;
    password?: string;
    fullName: string;
    email?: string;
    studentId?: string;
    academicYear?: AcademicYear;
    yearLevel?: YearLevel;
    mustChangePassword?: boolean;
    authProvider: 'student_id' | 'google_cmru' | 'password';
  }): StoredUser {
    const username = params.username.trim().toLowerCase();
    if (
      this.findUserByUsernameOrEmail(username, params.role) ||
      (params.studentId && this.findUserByUsernameOrEmail(params.studentId, params.role))
    ) {
      throw new Error('บัญชีผู้ใช้นี้มีอยู่ในระบบแล้ว');
    }
    const cleanEmail = params.email?.trim().toLowerCase() || '';
    const inferredStudentId =
      params.role === 'student'
        ? params.studentId?.trim() || params.username.trim()
        : params.studentId?.trim();

    const effectivePassword =
      params.password?.trim() ||
      (params.role === 'student' ? buildDefaultStudentPassword(inferredStudentId || username) : undefined);

    const mustChange =
      params.role === 'student'
        ? params.mustChangePassword !== undefined
          ? params.mustChangePassword
          : true
        : Boolean(params.mustChangePassword);

    const user: StoredUser = {
      id: `usr_${params.role}_${crypto.randomUUID().slice(0, 8)}`,
      role: params.role,
      username,
      email: cleanEmail || undefined,
      fullName: params.fullName.trim(),
      studentId: inferredStudentId,
      authProvider: params.authProvider,
      hasPassword: Boolean(effectivePassword),
      mustChangePassword: mustChange,
      failedLoginAttempts: 0,
      passwordHash: effectivePassword ? hashPassword(effectivePassword) : undefined,
      createdAt: new Date().toISOString(),
    };
    this.state.users.push(user);

    if (params.role === 'student') {
      const sid = inferredStudentId || username;
      const baseBasic = createEmptyBasicInfo(cleanEmail, user.fullName, sid);
      if (params.academicYear) {
        baseBasic.academicYear = params.academicYear;
      }
      if (params.yearLevel) {
        baseBasic.yearLevel = params.yearLevel;
      }
      this.state.basicInfos[user.id] = baseBasic;
    }

    this.persist();
    return user;
  }

  checkUserLockout(userId: string, nowMs = Date.now()) {
    const user = this.findUserById(userId);
    if (!user) {
      return { isLocked: false, remainingMs: 0, activeFailedAttempts: 0, remainingAttempts: 5 };
    }
    const status = evaluateLoginAttemptStatus({
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      nowMs,
    });
    if (!status.isLocked && user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      this.persist();
    }
    return status;
  }

  recordUserFailedLogin(userId: string, nowMs = Date.now()) {
    const user = this.findUserById(userId);
    if (!user) return null;
    const nextState = recordFailedAttemptState({
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      nowMs,
    });
    user.failedLoginAttempts = nextState.failedLoginAttempts;
    user.lockedUntil = nextState.lockedUntil;
    this.persist();
    return nextState;
  }

  clearUserFailedLogin(userId: string) {
    const user = this.findUserById(userId);
    if (!user) return;
    if ((user.failedLoginAttempts || 0) > 0 || user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      this.persist();
    }
  }

  changeUserPassword(
    userId: string,
    params: { currentPassword: string; newPassword: string; confirmPassword: string }
  ): StoredUser {
    const user = this.findUserById(userId);
    if (!user) {
      throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    }
    if (!verifyPassword(params.currentPassword, user.passwordHash)) {
      throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    const check = validatePasswordChangePayload(params);
    if (!check.valid) {
      throw new Error(check.error || 'รหัสผ่านใหม่ไม่ผ่านเกณฑ์ความปลอดภัย');
    }
    if (verifyPassword(params.newPassword, user.passwordHash)) {
      throw new Error('รหัสผ่านใหม่ต้องไม่ตรงกับรหัสผ่านเดิม');
    }

    user.passwordHash = hashPassword(params.newPassword);
    user.hasPassword = true;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date().toISOString();
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    this.persist();
    return user;
  }

  resetUserPassword(
    userId: string,
    input: string | { resetToDefault?: boolean; newPassword?: string }
  ): StoredUser {
    const user = this.findUserById(userId);
    if (!user) {
      throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    }

    const opts = typeof input === 'string' ? { newPassword: input } : input;
    let targetPassword = '';

    if (user.role === 'student') {
      if (opts.resetToDefault || !opts.newPassword?.trim()) {
        const sid = (user.studentId || user.username || '').trim();
        targetPassword = buildDefaultStudentPassword(sid);
        if (!targetPassword) {
          throw new Error('ไม่พบรหัสนักศึกษาสำหรับรีเซ็ตรหัสผ่านเริ่มต้น');
        }
      } else {
        const strongCheck = validateStrongPassword(opts.newPassword);
        if (!strongCheck.valid) {
          throw new Error(strongCheck.error || 'รหัสผ่านใหม่ไม่ผ่านเกณฑ์ความปลอดภัย');
        }
        targetPassword = opts.newPassword;
      }
      user.mustChangePassword = true;
      user.passwordChangedAt = undefined;
    } else {
      const pw = opts.newPassword || '';
      if (!pw || pw.length < 4) {
        throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
      }
      targetPassword = pw;
    }

    user.passwordHash = hashPassword(targetPassword);
    user.hasPassword = true;
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    this.persist();
    return user;
  }

  deleteUser(userId: string): StoredUser {
    const index = this.state.users.findIndex((u) => u.id === userId);
    if (index === -1) {
      throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    }
    const [removed] = this.state.users.splice(index, 1);
    delete this.state.basicInfos[userId];
    delete this.state.applications[userId];
    this.state.grades = this.state.grades.filter((g) => g.studentUserId !== userId);
    this.state.volunteers = this.state.volunteers.filter((v) => v.studentUserId !== userId);
    this.state.adminInitialized = this.state.users.some((u) => u.role === 'admin');
    this.persist();
    return removed;
  }

  importStudentsBulk(rows: ImportedStudentRow[]): ImportStudentsResult {
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    rows.forEach((row, idx) => {
      const idCheck = validateStudentId(String(row.studentId || ''));
      const fullName = String(row.fullName || '').trim();
      const normalizedEmail = String(row.email || '').trim().toLowerCase();

      if (!idCheck.valid || !fullName) {
        skippedCount += 1;
        errors.push(
          `แถวที่ ${idx + 1}: ${idCheck.error || 'ข้อมูลรหัสนักศึกษาหรือชื่อ-นามสกุลไม่ครบถ้วน'}`
        );
        return;
      }

      if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        skippedCount += 1;
        errors.push(`แถวที่ ${idx + 1}: รูปแบบอีเมลไม่ถูกต้อง`);
        return;
      }

      const studentId = idCheck.normalized;
      const academicYear = normalizeExcelAcademicYear(row.academicYear);
      const yearLevel = normalizeExcelYearLevel(row.yearLevel);
      const cleanGpax = row.gpax ? String(row.gpax).trim() : '';
      const cleanPhone = row.phone ? String(row.phone).trim() : '';
      const loanStatus = row.hasStudentLoan
        ? normalizeExcelLoanStatus(row.hasStudentLoan)
        : undefined;

      const existing =
        this.findUserByUsernameOrEmail(studentId, 'student') ||
        (normalizedEmail ? this.findUserByUsernameOrEmail(normalizedEmail, 'student') : undefined);

      if (existing) {
        existing.fullName = fullName;
        existing.studentId = studentId;
        if (normalizedEmail) {
          existing.email = normalizedEmail;
        }
        if (!existing.username) {
          existing.username = studentId.toLowerCase();
        }
        if (row.password && row.password.trim().length >= 4) {
          existing.passwordHash = hashPassword(row.password.trim());
          existing.hasPassword = true;
          existing.mustChangePassword = true;
        } else if (!existing.passwordHash) {
          existing.passwordHash = hashPassword(buildDefaultStudentPassword(studentId));
          existing.hasPassword = true;
          existing.mustChangePassword = true;
        }
        const currentBasic =
          this.state.basicInfos[existing.id] ||
          createEmptyBasicInfo(normalizedEmail, fullName, studentId);
        this.state.basicInfos[existing.id] = {
          ...currentBasic,
          fullName,
          studentId,
          email: normalizedEmail || currentBasic.email || '',
          academicYear,
          yearLevel,
          gpax: cleanGpax || currentBasic.gpax,
          phone: cleanPhone || currentBasic.phone,
          hasStudentLoan: loanStatus || currentBasic.hasStudentLoan,
        };
        updatedCount += 1;
        return;
      }

      const cleanPw =
        row.password && row.password.trim().length >= 4
          ? row.password.trim()
          : buildDefaultStudentPassword(studentId);

      const createdUser: StoredUser = {
        id: `usr_student_${crypto.randomUUID().slice(0, 8)}`,
        role: 'student',
        username: studentId.toLowerCase(),
        email: normalizedEmail || undefined,
        fullName,
        studentId,
        authProvider: 'password',
        hasPassword: true,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        passwordHash: hashPassword(cleanPw),
        createdAt: new Date().toISOString(),
      };
      this.state.users.push(createdUser);

      const basic = createEmptyBasicInfo(normalizedEmail, fullName, studentId);
      basic.academicYear = academicYear;
      basic.yearLevel = yearLevel;
      if (cleanGpax) basic.gpax = cleanGpax;
      if (cleanPhone) basic.phone = cleanPhone;
      if (loanStatus) basic.hasStudentLoan = loanStatus;
      this.state.basicInfos[createdUser.id] = basic;
      createdCount += 1;
    });

    this.persist();
    return { createdCount, updatedCount, skippedCount, errors };
  }

  getStudentBundle(studentUserId: string): StudentFullRecord | null {
    const user = this.findUserById(studentUserId);
    if (!user || user.role !== 'student') return null;

    const rawBasic =
      this.state.basicInfos[studentUserId] ||
      createEmptyBasicInfo(user.email || user.username, user.fullName, user.studentId || '');

    const basicInfo: BasicInfoData = {
      ...rawBasic,
      receivedScholarships:
        rawBasic.hasOtherScholarship === 'ได้รับทุน'
          ? sanitizeReceivedScholarships(rawBasic.receivedScholarships, rawBasic.otherScholarshipDetail)
          : [],
    };

    return {
      user: sanitizeUser(user),
      basicInfo,
      application: this.state.applications[studentUserId] || null,
      grades: this.state.grades
        .filter((g) => g.studentUserId === studentUserId)
        .sort((a, b) => a.academicYear.localeCompare(b.academicYear) || a.semester.localeCompare(b.semester)),
      volunteers: this.state.volunteers
        .filter((v) => v.studentUserId === studentUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  getAllStudentBundles(): StudentFullRecord[] {
    return this.state.users
      .filter((u) => u.role === 'student')
      .map((u) => this.getStudentBundle(u.id))
      .filter((b): b is StudentFullRecord => b !== null);
  }

  getPublicOverview(
    academicYear: AcademicYear | 'all' = 'all',
    yearLevel: YearLevel | 'all' = 'all'
  ): PublicOverviewStats {
    return buildPublicOverviewStats(this.getAllStudentBundles(), academicYear, yearLevel);
  }

  savePdpaDecision(studentUserId: string, consented: boolean): BasicInfoData {
    const user = this.findUserById(studentUserId);
    if (!user) throw new Error('ไม่พบบัญชีนักศึกษา');
    const existing =
      this.state.basicInfos[studentUserId] ||
      createEmptyBasicInfo(user.email || user.username, user.fullName, user.studentId || '');

    const updated: BasicInfoData = {
      ...existing,
      pdpaConsented: consented,
      pdpaDeclined: !consented,
      pdpaConsentedAt: consented ? new Date().toISOString() : existing.pdpaConsentedAt,
    };
    this.state.basicInfos[studentUserId] = updated;
    this.persist();
    return updated;
  }

  saveBasicInfo(studentUserId: string, rawPayload: BasicInfoData): BasicInfoData {
    const user = this.findUserById(studentUserId);
    if (!user) throw new Error('ไม่พบบัญชีนักศึกษา');

    const payload = sanitizePayloadValue(rawPayload);
    const cleanedScholarships =
      payload.hasOtherScholarship === 'ได้รับทุน'
        ? sanitizeReceivedScholarships(payload.receivedScholarships, payload.otherScholarshipDetail)
        : [];
    const summaryText = cleanedScholarships
      .map((s) => (s.provider ? `${s.name} (${s.provider})` : s.name))
      .join(', ');

    const updated: BasicInfoData = {
      ...payload,
      receivedScholarships: cleanedScholarships,
      otherScholarshipDetail: payload.hasOtherScholarship === 'ได้รับทุน' ? summaryText : '',
      savedAt: new Date().toISOString(),
    };
    if (payload.fullName?.trim()) {
      user.fullName = payload.fullName.trim();
    }
    if (payload.studentId?.trim() && /^\d{8}$/.test(payload.studentId.trim())) {
      user.studentId = payload.studentId.trim();
    }
    this.state.basicInfos[studentUserId] = updated;
    this.persist();
    return updated;
  }

  saveApplication(
    studentUserId: string,
    rawPayload: ScholarshipApplicationData,
    submitNow: boolean
  ): ScholarshipApplicationData {
    const now = new Date().toISOString();
    const existing = this.state.applications[studentUserId];
    const payload = sanitizePayloadValue(rawPayload);

    let nextStatus: ApplicationStatus = existing?.status || 'draft';
    if (submitNow) {
      nextStatus = 'submitted';
    } else if (!existing) {
      nextStatus = 'draft';
    }

    const updated: ScholarshipApplicationData = {
      ...payload,
      id: existing?.id || `app_${studentUserId}`,
      studentUserId,
      status: nextStatus,
      advisorComment: existing?.advisorComment || '',
      reviewedBy: existing?.reviewedBy,
      reviewedAt: existing?.reviewedAt,
      submittedAt: submitNow ? existing?.submittedAt || now : existing?.submittedAt,
      updatedAt: now,
    };

    this.state.applications[studentUserId] = updated;
    this.persist();
    return updated;
  }

  reviewApplication(
    studentUserId: string,
    params: { status: ApplicationStatus; advisorComment: string; reviewerName: string }
  ): ScholarshipApplicationData {
    const app = this.state.applications[studentUserId];
    if (!app) {
      throw new Error('นักศึกษายังไม่ได้บันทึกใบสมัครทุนการศึกษา');
    }
    const now = new Date().toISOString();
    app.status = params.status;
    app.advisorComment = params.advisorComment;
    app.reviewedBy = params.reviewerName;
    app.reviewedAt = now;
    app.updatedAt = now;
    this.persist();
    return app;
  }

  upsertGradeRecord(params: {
    studentUserId: string;
    academicYear: AcademicYear;
    yearLevel: YearLevel;
    semester: SemesterType;
    gpa: string;
    attachments: UploadedFileMeta[];
    uploadedByRole: UserRole;
    uploadedByName: string;
  }): GradeRecord {
    const user = this.findUserById(params.studentUserId);
    if (!user) throw new Error('ไม่พบบัญชีนักศึกษา');
    const basic = this.state.basicInfos[params.studentUserId];
    const now = new Date().toISOString();

    const existing = this.state.grades.find(
      (g) =>
        g.studentUserId === params.studentUserId &&
        g.academicYear === params.academicYear &&
        g.yearLevel === params.yearLevel &&
        g.semester === params.semester
    );

    if (existing) {
      existing.gpa = params.gpa;
      existing.attachments = params.attachments;
      existing.uploadedByRole = params.uploadedByRole;
      existing.uploadedByName = params.uploadedByName;
      existing.updatedAt = now;
      this.persist();
      return existing;
    }

    const created: GradeRecord = {
      id: `grd_${crypto.randomUUID().slice(0, 8)}`,
      studentUserId: params.studentUserId,
      studentId: basic?.studentId || user.studentId || '-',
      studentName: basic?.fullName || user.fullName,
      academicYear: params.academicYear,
      yearLevel: params.yearLevel,
      semester: params.semester,
      gpa: params.gpa,
      attachments: params.attachments,
      uploadedByRole: params.uploadedByRole,
      uploadedByName: params.uploadedByName,
      createdAt: now,
      updatedAt: now,
    };

    this.state.grades.push(created);
    this.persist();
    return created;
  }

  addVolunteerRecord(params: {
    studentUserId: string;
    academicYear: AcademicYear;
    activityTitle: string;
    activityDetail: string;
    learnings: string;
    hours: number;
    activityDate: string;
    dailyLifeApplication: string;
    photos: UploadedFileMeta[];
  }): VolunteerRecord {
    const user = this.findUserById(params.studentUserId);
    if (!user) throw new Error('ไม่พบบัญชีนักศึกษา');
    const app = this.state.applications[params.studentUserId];
    if (!app || app.status !== 'approved') {
      throw new Error('ระบบจิตอาสายังล็อกอยู่ จะเปิดใช้งานเมื่อได้รับอนุมัติทุนการศึกษาเรียบร้อยแล้ว');
    }

    const basic = this.state.basicInfos[params.studentUserId];
    const record: VolunteerRecord = {
      id: `vol_${crypto.randomUUID().slice(0, 8)}`,
      studentUserId: params.studentUserId,
      studentId: basic?.studentId || user.studentId || '-',
      studentName: basic?.fullName || user.fullName,
      academicYear: params.academicYear,
      activityTitle: params.activityTitle,
      activityDetail: params.activityDetail,
      learnings: params.learnings,
      hours: Number(params.hours),
      activityDate: params.activityDate,
      dailyLifeApplication: params.dailyLifeApplication,
      photos: params.photos,
      approvalStatus: 'pending',
      approvedHours: 0,
      advisorNote: '',
      createdAt: new Date().toISOString(),
    };
    this.state.volunteers.push(record);
    this.persist();
    return record;
  }

  reviewVolunteerRecord(
    volunteerId: string,
    params: {
      approvalStatus: 'approved' | 'rejected' | 'pending';
      approvedHours: number;
      advisorNote: string;
      reviewerName: string;
    }
  ): VolunteerRecord {
    const record = this.state.volunteers.find((v) => v.id === volunteerId);
    if (!record) throw new Error('ไม่พบรายการจิตอาสา');
    record.approvalStatus = params.approvalStatus;
    record.approvedHours =
      params.approvalStatus === 'approved' ? Number(params.approvedHours) : 0;
    record.advisorNote = params.advisorNote;
    record.reviewedBy = params.reviewerName;
    record.reviewedAt = new Date().toISOString();
    this.persist();
    return record;
  }

  saveUploadedFile(params: {
    name: string;
    mimeType: string;
    base64Data: string;
  }): UploadedFileMeta {
    const cleanBase64 = params.base64Data.includes(',')
      ? params.base64Data.split(',')[1]
      : params.base64Data;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const safeDisplayName = clampPayloadText(path.basename(params.name || 'file'), 140) || 'file';

    const validation = validateUploadedBinary({
      name: safeDisplayName,
      mimeType: params.mimeType,
      bytes: buffer,
      maxBytes: MAX_SERVER_UPLOAD_BYTES,
    });
    if (!validation.valid || !validation.canonicalExt || !validation.canonicalMime) {
      throw new Error(validation.error || 'ไฟล์อัปโหลดไม่ถูกต้อง');
    }

    const safeFilename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${validation.canonicalExt}`;
    const dest = path.resolve(UPLOADS_DIR, safeFilename);
    if (!dest.startsWith(UPLOADS_DIR + path.sep)) {
      throw new Error('เส้นทางจัดเก็บไฟล์ไม่ถูกต้อง');
    }
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(dest, buffer);

    if (this.getRemoteConfig()) {
      const payload = JSON.stringify({
        mimeType: validation.canonicalMime,
        base64: buffer.toString('base64'),
      });
      this.pendingRemotePersist = this.pendingRemotePersist
        .catch(() => {})
        .then(() => this.remoteSet(`${REMOTE_UPLOAD_PREFIX}${safeFilename}`, payload));
    }

    return {
      id: `file_${crypto.randomUUID().slice(0, 8)}`,
      name: safeDisplayName,
      size: buffer.length,
      mimeType: validation.canonicalMime,
      url: `/uploads/${safeFilename}`,
      uploadedAt: new Date().toISOString(),
    };
  }

  async readUploadedFile(
    safeFilename: string
  ): Promise<{ buffer: Buffer; mimeType?: string } | null> {
    const dest = path.resolve(UPLOADS_DIR, safeFilename);
    if (!dest.startsWith(UPLOADS_DIR + path.sep)) {
      return null;
    }
    if (fs.existsSync(dest)) {
      return { buffer: fs.readFileSync(dest) };
    }
    if (this.getRemoteConfig()) {
      try {
        const raw = await this.remoteGet(`${REMOTE_UPLOAD_PREFIX}${safeFilename}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { mimeType?: string; base64?: string };
        if (!parsed.base64) return null;
        const buffer = Buffer.from(parsed.base64, 'base64');
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        fs.writeFileSync(dest, buffer);
        return { buffer, mimeType: parsed.mimeType };
      } catch {
        return null;
      }
    }
    return null;
  }
  getWorkspaceConfig(): GoogleWorkspaceConfig {
    return this.state.workspaceConfig || {};
  }

  saveWorkspaceConfig(raw: Record<string, unknown>): GoogleWorkspaceConfig {
    const cleaned = sanitizeWorkspaceConfigInput(raw);
    this.state.workspaceConfig = cleaned;
    this.persist();
    return cleaned;
  }
}

export const store = new FileStore();
