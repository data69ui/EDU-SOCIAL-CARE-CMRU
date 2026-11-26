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
  recordFailedAttemptState,
  sanitizeReceivedScholarships,
  validatePasswordChangePayload,
  validateStrongPassword,
  validateStudentId,
} from '../src/utils/scholarshipLogic.js';
import {
  clampPayloadText,
  isSafeUploadFilename,
  MAX_SERVER_UPLOAD_BYTES,
  sanitizeWorkspaceConfigInput,
  validateUploadedBinary,
} from '../src/utils/securityGuard.js';
import {
  decodeBase64ToBytes,
  generateRandomHex,
  hashPasswordWorker,
  verifyPasswordWorker,
} from './crypto.js';
import type { CloudflareEnv, D1PreparedStatement } from './types.js';

export interface StoredUser extends UserAccount {
  passwordHash?: string;
}

interface UserRow {
  id: string;
  role: UserRole;
  username: string;
  email: string | null;
  full_name: string;
  student_id: string | null;
  auth_provider: 'student_id' | 'google_cmru' | 'password';
  has_password: number;
  must_change_password: number;
  password_changed_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  password_hash: string | null;
  created_at: string;
}

interface BasicInfoRow {
  student_user_id: string;
  academic_year: AcademicYear;
  year_level: YearLevel;
  student_id: string;
  full_name: string;
  email: string;
  phone: string;
  gpax: string;
  has_student_loan: 'กู้' | 'ไม่กู้';
  has_other_scholarship: 'ได้รับทุน' | 'ไม่ได้รับทุน';
  other_scholarship_detail: string;
  received_scholarships_json: string;
  pdpa_consented: number;
  pdpa_declined: number;
  pdpa_consented_at: string | null;
  saved_at: string | null;
  payload_json: string;
}

interface ApplicationRow {
  id: string;
  student_user_id: string;
  status: ApplicationStatus;
  academic_year: AcademicYear;
  year_level: YearLevel;
  gpax: string;
  advisor_comment: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  updated_at: string;
  payload_json: string;
}

interface GradeRow {
  id: string;
  student_user_id: string;
  student_id: string;
  student_name: string;
  academic_year: AcademicYear;
  year_level: YearLevel;
  semester: SemesterType;
  gpa: string;
  attachments_json: string;
  uploaded_by_role: UserRole;
  uploaded_by_name: string;
  created_at: string;
  updated_at: string;
}

interface VolunteerRow {
  id: string;
  student_user_id: string;
  student_id: string;
  student_name: string;
  academic_year: AcademicYear;
  activity_title: string;
  activity_detail: string;
  learnings: string;
  hours: number;
  activity_date: string;
  daily_life_application: string;
  photos_json: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_hours: number;
  advisor_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

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

export function sanitizeUser(user: StoredUser): UserAccount {
  const { passwordHash: _ignored, ...rest } = user;
  return rest;
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    role: row.role,
    username: row.username,
    email: row.email || undefined,
    fullName: row.full_name,
    studentId: row.student_id || undefined,
    authProvider: row.auth_provider,
    hasPassword: Boolean(row.has_password),
    mustChangePassword: Boolean(row.must_change_password),
    passwordChangedAt: row.password_changed_at || undefined,
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockedUntil: row.locked_until || undefined,
    passwordHash: row.password_hash || undefined,
    createdAt: row.created_at,
  };
}

function rowToBasicInfo(row: BasicInfoRow | null, user: StoredUser): BasicInfoData {
  if (!row) {
    return createEmptyBasicInfo(user.email || user.username, user.fullName, user.studentId || '');
  }
  const base = createEmptyBasicInfo(user.email || user.username, user.fullName, user.studentId || '');
  const parsed = safeJsonParse<Partial<BasicInfoData>>(row.payload_json, {});
  const rawScholarships = safeJsonParse<BasicInfoData['receivedScholarships']>(
    row.received_scholarships_json,
    parsed.receivedScholarships
  );
  const hasOther = row.has_other_scholarship || parsed.hasOtherScholarship || 'ไม่ได้รับทุน';
  const cleanedScholarships =
    hasOther === 'ได้รับทุน'
      ? sanitizeReceivedScholarships(rawScholarships, row.other_scholarship_detail)
      : [];

  return {
    ...base,
    ...parsed,
    academicYear: row.academic_year || parsed.academicYear || base.academicYear,
    yearLevel: row.year_level || parsed.yearLevel || base.yearLevel,
    studentId: row.student_id || parsed.studentId || base.studentId,
    fullName: row.full_name || parsed.fullName || base.fullName,
    email: row.email ?? parsed.email ?? base.email,
    phone: row.phone ?? parsed.phone ?? base.phone,
    gpax: row.gpax ?? parsed.gpax ?? base.gpax,
    hasStudentLoan: row.has_student_loan || parsed.hasStudentLoan || base.hasStudentLoan,
    hasOtherScholarship: hasOther,
    otherScholarshipDetail:
      hasOther === 'ได้รับทุน' ? row.other_scholarship_detail || '' : '',
    receivedScholarships: cleanedScholarships,
    pdpaConsented: Boolean(row.pdpa_consented),
    pdpaDeclined: Boolean(row.pdpa_declined),
    pdpaConsentedAt: row.pdpa_consented_at || undefined,
    savedAt: row.saved_at || undefined,
  };
}

function rowToApplication(row: ApplicationRow): ScholarshipApplicationData {
  const parsed = safeJsonParse<Partial<ScholarshipApplicationData>>(row.payload_json, {});
  return {
    ...(parsed as ScholarshipApplicationData),
    id: row.id,
    studentUserId: row.student_user_id,
    status: row.status,
    academicYear: row.academic_year || parsed.academicYear || '2569',
    yearLevel: row.year_level || parsed.yearLevel || 'ปี 1',
    gpax: row.gpax ?? parsed.gpax ?? '',
    advisorComment: row.advisor_comment || '',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    submittedAt: row.submitted_at || undefined,
    updatedAt: row.updated_at,
  };
}

function rowToGrade(row: GradeRow): GradeRecord {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    studentId: row.student_id,
    studentName: row.student_name,
    academicYear: row.academic_year,
    yearLevel: row.year_level,
    semester: row.semester,
    gpa: row.gpa,
    attachments: safeJsonParse<UploadedFileMeta[]>(row.attachments_json, []),
    uploadedByRole: row.uploaded_by_role,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToVolunteer(row: VolunteerRow): VolunteerRecord {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    studentId: row.student_id,
    studentName: row.student_name,
    academicYear: row.academic_year,
    activityTitle: row.activity_title,
    activityDetail: row.activity_detail,
    learnings: row.learnings,
    hours: Number(row.hours || 0),
    activityDate: row.activity_date,
    dailyLifeApplication: row.daily_life_application,
    photos: safeJsonParse<UploadedFileMeta[]>(row.photos_json, []),
    approvalStatus: row.approval_status,
    approvedHours: Number(row.approved_hours || 0),
    advisorNote: row.advisor_note || '',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    createdAt: row.created_at,
  };
}

export class D1Store {
  constructor(private readonly env: CloudflareEnv) {}

  async getOrCreateSessionSecret(): Promise<string> {
    const envSecret = this.env.SESSION_SECRET?.trim();
    if (envSecret) return envSecret;

    const existing = await this.env.DB.prepare(
      'SELECT value FROM app_meta WHERE key = ?'
    )
      .bind('session_secret')
      .first<{ value: string }>();

    if (existing?.value && existing.value.length >= 32) {
      return existing.value;
    }

    const generated = generateRandomHex(32);
    await this.env.DB.prepare(
      'INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)'
    )
      .bind('session_secret', generated, new Date().toISOString())
      .run();

    const stored = await this.env.DB.prepare(
      'SELECT value FROM app_meta WHERE key = ?'
    )
      .bind('session_secret')
      .first<{ value: string }>();

    return stored?.value || generated;
  }

  async getWorkspaceConfig(): Promise<GoogleWorkspaceConfig> {
    const existing = await this.env.DB.prepare(
      'SELECT value FROM app_meta WHERE key = ?'
    )
      .bind('workspace_config')
      .first<{ value: string }>();
    return safeJsonParse<GoogleWorkspaceConfig>(existing?.value, {});
  }

  async saveWorkspaceConfig(raw: Record<string, unknown>): Promise<GoogleWorkspaceConfig> {
    const cleaned = sanitizeWorkspaceConfigInput(raw);
    await this.env.DB.prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
      .bind('workspace_config', JSON.stringify(cleaned), new Date().toISOString())
      .run();
    return cleaned;
  }

  async isAdminInitialized(): Promise<boolean> {
    const row = await this.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'"
    ).first<{ cnt: number }>();
    return Number(row?.cnt || 0) > 0;
  }

  async getUsers(): Promise<StoredUser[]> {
    const res = await this.env.DB.prepare(
      'SELECT * FROM users ORDER BY created_at ASC'
    ).all<UserRow>();
    return res.results.map(rowToUser);
  }

  async getTeacherNames(): Promise<string[]> {
    const res = await this.env.DB.prepare(
      "SELECT full_name FROM users WHERE role = 'teacher' AND TRIM(full_name) != '' ORDER BY created_at ASC"
    ).all<{ full_name: string }>();
    return res.results.map((r) => r.full_name.trim()).filter(Boolean);
  }

  async findUserById(id: string): Promise<StoredUser | undefined> {
    const row = await this.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<UserRow>();
    return row ? rowToUser(row) : undefined;
  }

  async findUserByUsernameOrEmail(
    identifier: string,
    role?: UserRole
  ): Promise<StoredUser | undefined> {
    const normalized = identifier.trim().toLowerCase();
    const row = role
      ? await this.env.DB.prepare(
          `SELECT * FROM users WHERE role = ? AND (LOWER(username) = ? OR LOWER(COALESCE(email, '')) = ? OR LOWER(COALESCE(student_id, '')) = ?) LIMIT 1`
        )
          .bind(role, normalized, normalized, normalized)
          .first<UserRow>()
      : await this.env.DB.prepare(
          `SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(COALESCE(email, '')) = ? OR LOWER(COALESCE(student_id, '')) = ? LIMIT 1`
        )
          .bind(normalized, normalized, normalized)
          .first<UserRow>();
    return row ? rowToUser(row) : undefined;
  }

  private buildInsertBasicInfoStmt(userId: string, basic: BasicInfoData): D1PreparedStatement {
    return this.env.DB.prepare(
      `INSERT INTO basic_infos (
        student_user_id, academic_year, year_level, student_id, full_name,
        email, phone, gpax, has_student_loan, has_other_scholarship,
        other_scholarship_detail, received_scholarships_json,
        pdpa_consented, pdpa_declined, pdpa_consented_at, saved_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_user_id) DO UPDATE SET
        academic_year = excluded.academic_year,
        year_level = excluded.year_level,
        student_id = excluded.student_id,
        full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        gpax = excluded.gpax,
        has_student_loan = excluded.has_student_loan,
        has_other_scholarship = excluded.has_other_scholarship,
        other_scholarship_detail = excluded.other_scholarship_detail,
        received_scholarships_json = excluded.received_scholarships_json,
        pdpa_consented = excluded.pdpa_consented,
        pdpa_declined = excluded.pdpa_declined,
        pdpa_consented_at = excluded.pdpa_consented_at,
        saved_at = excluded.saved_at,
        payload_json = excluded.payload_json`
    ).bind(
      userId,
      basic.academicYear,
      basic.yearLevel,
      basic.studentId,
      basic.fullName,
      basic.email || '',
      basic.phone || '',
      basic.gpax || '',
      basic.hasStudentLoan,
      basic.hasOtherScholarship,
      basic.otherScholarshipDetail || '',
      JSON.stringify(basic.receivedScholarships || []),
      basic.pdpaConsented ? 1 : 0,
      basic.pdpaDeclined ? 1 : 0,
      basic.pdpaConsentedAt || null,
      basic.savedAt || null,
      JSON.stringify(basic)
    );
  }

  async createFirstAdmin(params: {
    username: string;
    password: string;
    fullName: string;
  }): Promise<StoredUser> {
    const initialized = await this.isAdminInitialized();
    if (initialized) {
      throw new Error('ระบบผู้ดูแลระบบได้ถูกตั้งค่าครั้งแรกเรียบร้อยแล้ว');
    }
    const username = params.username.trim().toLowerCase();
    const existing = await this.findUserByUsernameOrEmail(username);
    if (existing) {
      throw new Error('ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว');
    }

    const admin: StoredUser = {
      id: `usr_admin_${crypto.randomUUID().slice(0, 8)}`,
      role: 'admin',
      username,
      fullName: params.fullName.trim() || 'ผู้ดูแลระบบงานทุนการศึกษา',
      authProvider: 'password',
      hasPassword: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      passwordHash: await hashPasswordWorker(params.password),
      createdAt: new Date().toISOString(),
    };

    try {
      await this.env.DB.prepare(
        `INSERT INTO users (
          id, role, username, email, full_name, student_id, auth_provider,
          has_password, must_change_password, failed_login_attempts, password_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          admin.id,
          admin.role,
          admin.username,
          null,
          admin.fullName,
          null,
          admin.authProvider,
          1,
          0,
          0,
          admin.passwordHash!,
          admin.createdAt
        )
        .run();
    } catch {
      throw new Error('ระบบผู้ดูแลระบบได้ถูกตั้งค่าครั้งแรกเรียบร้อยแล้ว');
    }

    return admin;
  }

  async createUser(params: {
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
  }): Promise<StoredUser> {
    const username = params.username.trim().toLowerCase();
    if (
      (await this.findUserByUsernameOrEmail(username, params.role)) ||
      (params.studentId && (await this.findUserByUsernameOrEmail(params.studentId, params.role)))
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
      (params.role === 'student'
        ? buildDefaultStudentPassword(inferredStudentId || username)
        : undefined);

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
      passwordHash: effectivePassword ? await hashPasswordWorker(effectivePassword) : undefined,
      createdAt: new Date().toISOString(),
    };

    const stmts: D1PreparedStatement[] = [
      this.env.DB.prepare(
        `INSERT INTO users (
          id, role, username, email, full_name, student_id, auth_provider,
          has_password, must_change_password, failed_login_attempts, password_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        user.id,
        user.role,
        user.username,
        user.email || null,
        user.fullName,
        user.studentId || null,
        user.authProvider,
        user.hasPassword ? 1 : 0,
        user.mustChangePassword ? 1 : 0,
        0,
        user.passwordHash || null,
        user.createdAt
      ),
    ];

    if (params.role === 'student') {
      const sid = inferredStudentId || username;
      const baseBasic = createEmptyBasicInfo(cleanEmail, user.fullName, sid);
      if (params.academicYear) baseBasic.academicYear = params.academicYear;
      if (params.yearLevel) baseBasic.yearLevel = params.yearLevel;
      stmts.push(this.buildInsertBasicInfoStmt(user.id, baseBasic));
    }

    await this.env.DB.batch(stmts);
    return user;
  }

  async checkUserLockout(userId: string, nowMs = Date.now()) {
    const user = await this.findUserById(userId);
    if (!user) {
      return { isLocked: false, remainingMs: 0, activeFailedAttempts: 0, remainingAttempts: 5 };
    }
    const status = evaluateLoginAttemptStatus({
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      nowMs,
    });
    if (!status.isLocked && user.lockedUntil) {
      await this.env.DB.prepare(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?'
      )
        .bind(userId)
        .run();
    }
    return status;
  }

  async recordUserFailedLogin(userId: string, nowMs = Date.now()) {
    const user = await this.findUserById(userId);
    if (!user) return null;
    const nextState = recordFailedAttemptState({
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      nowMs,
    });
    await this.env.DB.prepare(
      'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?'
    )
      .bind(nextState.failedLoginAttempts, nextState.lockedUntil || null, userId)
      .run();
    return nextState;
  }

  async clearUserFailedLogin(userId: string) {
    const user = await this.findUserById(userId);
    if (!user) return;
    if ((user.failedLoginAttempts || 0) > 0 || user.lockedUntil) {
      await this.env.DB.prepare(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?'
      )
        .bind(userId)
        .run();
    }
  }

  async verifyPassword(password: string, storedHash?: string): Promise<boolean> {
    return verifyPasswordWorker(password, storedHash);
  }

  async changeUserPassword(
    userId: string,
    params: { currentPassword: string; newPassword: string; confirmPassword: string }
  ): Promise<StoredUser> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    }
    if (!(await verifyPasswordWorker(params.currentPassword, user.passwordHash))) {
      throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    const check = validatePasswordChangePayload(params);
    if (!check.valid) {
      throw new Error(check.error || 'รหัสผ่านใหม่ไม่ผ่านเกณฑ์ความปลอดภัย');
    }
    if (await verifyPasswordWorker(params.newPassword, user.passwordHash)) {
      throw new Error('รหัสผ่านใหม่ต้องไม่ตรงกับรหัสผ่านเดิม');
    }

    const newHash = await hashPasswordWorker(params.newPassword);
    const changedAt = new Date().toISOString();

    await this.env.DB.prepare(
      `UPDATE users
       SET password_hash = ?, has_password = 1, must_change_password = 0,
           password_changed_at = ?, failed_login_attempts = 0, locked_until = NULL
       WHERE id = ?`
    )
      .bind(newHash, changedAt, userId)
      .run();

    const updated = await this.findUserById(userId);
    if (!updated) throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    return updated;
  }

  async resetUserPassword(
    userId: string,
    input: string | { resetToDefault?: boolean; newPassword?: string }
  ): Promise<StoredUser> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    }

    const opts = typeof input === 'string' ? { newPassword: input } : input;
    let targetPassword = '';
    let nextMustChange = user.mustChangePassword;
    let nextPasswordChangedAt = user.passwordChangedAt || null;

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
      nextMustChange = true;
      nextPasswordChangedAt = null;
    } else {
      const pw = opts.newPassword || '';
      if (!pw || pw.length < 4) {
        throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
      }
      targetPassword = pw;
    }

    const newHash = await hashPasswordWorker(targetPassword);
    await this.env.DB.prepare(
      `UPDATE users
       SET password_hash = ?, has_password = 1, must_change_password = ?,
           password_changed_at = ?, failed_login_attempts = 0, locked_until = NULL
       WHERE id = ?`
    )
      .bind(newHash, nextMustChange ? 1 : 0, nextPasswordChangedAt, userId)
      .run();

    const updated = await this.findUserById(userId);
    if (!updated) throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    return updated;
  }

  async deleteUser(userId: string): Promise<StoredUser> {
    const target = await this.findUserById(userId);
    if (!target) {
      throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    }
    await this.env.DB.batch([
      this.env.DB.prepare('DELETE FROM volunteers WHERE student_user_id = ?').bind(userId),
      this.env.DB.prepare('DELETE FROM grades WHERE student_user_id = ?').bind(userId),
      this.env.DB.prepare('DELETE FROM applications WHERE student_user_id = ?').bind(userId),
      this.env.DB.prepare('DELETE FROM basic_infos WHERE student_user_id = ?').bind(userId),
      this.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    ]);
    return target;
  }

  async importStudentsBulk(rows: ImportedStudentRow[]): Promise<ImportStudentsResult> {
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    const existingStudentsRes = await this.env.DB.prepare(
      "SELECT * FROM users WHERE role = 'student'"
    ).all<UserRow>();
    const existingStudents = existingStudentsRes.results.map(rowToUser);
    const existingBasicsRes = await this.env.DB.prepare(
      'SELECT * FROM basic_infos'
    ).all<BasicInfoRow>();
    const basicsByUserId = new Map<string, BasicInfoRow>(
      existingBasicsRes.results.map((b) => [b.student_user_id, b])
    );

    const findExistingStudent = (studentId: string, email: string): StoredUser | undefined => {
      const sidLower = studentId.toLowerCase();
      return existingStudents.find(
        (u) =>
          u.username.toLowerCase() === sidLower ||
          u.studentId?.toLowerCase() === sidLower ||
          (email && u.email?.toLowerCase() === email)
      );
    };

    const stmts: D1PreparedStatement[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const idCheck = validateStudentId(String(row.studentId || ''));
      const fullName = String(row.fullName || '').trim();
      const normalizedEmail = String(row.email || '').trim().toLowerCase();

      if (!idCheck.valid || !fullName) {
        skippedCount += 1;
        errors.push(
          `แถวที่ ${idx + 1}: ${idCheck.error || 'ข้อมูลรหัสนักศึกษาหรือชื่อ-นามสกุลไม่ครบถ้วน'}`
        );
        continue;
      }

      if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        skippedCount += 1;
        errors.push(`แถวที่ ${idx + 1}: รูปแบบอีเมลไม่ถูกต้อง`);
        continue;
      }

      const studentId = idCheck.normalized;
      const academicYear = normalizeExcelAcademicYear(row.academicYear);
      const yearLevel = normalizeExcelYearLevel(row.yearLevel);
      const cleanGpax = row.gpax ? String(row.gpax).trim() : '';
      const cleanPhone = row.phone ? String(row.phone).trim() : '';
      const loanStatus = row.hasStudentLoan
        ? normalizeExcelLoanStatus(row.hasStudentLoan)
        : undefined;

      const existing = findExistingStudent(studentId, normalizedEmail);

      if (existing) {
        const nextEmail = normalizedEmail || existing.email || null;
        const nextUsername = existing.username || studentId.toLowerCase();
        let nextPasswordHash = existing.passwordHash;
        let nextHasPassword = existing.hasPassword;
        let nextMustChange = existing.mustChangePassword;

        if (row.password && row.password.trim().length >= 4) {
          nextPasswordHash = await hashPasswordWorker(row.password.trim());
          nextHasPassword = true;
          nextMustChange = true;
        } else if (!existing.passwordHash) {
          nextPasswordHash = await hashPasswordWorker(buildDefaultStudentPassword(studentId));
          nextHasPassword = true;
          nextMustChange = true;
        }

        stmts.push(
          this.env.DB.prepare(
            `UPDATE users
             SET full_name = ?, student_id = ?, email = ?, username = ?,
                 password_hash = ?, has_password = ?, must_change_password = ?
             WHERE id = ?`
          ).bind(
            fullName,
            studentId,
            nextEmail,
            nextUsername,
            nextPasswordHash || null,
            nextHasPassword ? 1 : 0,
            nextMustChange ? 1 : 0,
            existing.id
          )
        );

        const currentBasic = rowToBasicInfo(basicsByUserId.get(existing.id) || null, existing);
        const updatedBasic: BasicInfoData = {
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
        stmts.push(this.buildInsertBasicInfoStmt(existing.id, updatedBasic));
        updatedCount += 1;
        continue;
      }

      const cleanPw =
        row.password && row.password.trim().length >= 4
          ? row.password.trim()
          : buildDefaultStudentPassword(studentId);
      const createdId = `usr_student_${crypto.randomUUID().slice(0, 8)}`;
      const createdAt = new Date().toISOString();
      const pwHash = await hashPasswordWorker(cleanPw);

      const newUser: StoredUser = {
        id: createdId,
        role: 'student',
        username: studentId.toLowerCase(),
        email: normalizedEmail || undefined,
        fullName,
        studentId,
        authProvider: 'password',
        hasPassword: true,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        passwordHash: pwHash,
        createdAt,
      };
      existingStudents.push(newUser);

      stmts.push(
        this.env.DB.prepare(
          `INSERT INTO users (
            id, role, username, email, full_name, student_id, auth_provider,
            has_password, must_change_password, failed_login_attempts, password_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          createdId,
          'student',
          studentId.toLowerCase(),
          normalizedEmail || null,
          fullName,
          studentId,
          'password',
          1,
          1,
          0,
          pwHash,
          createdAt
        )
      );

      const basic = createEmptyBasicInfo(normalizedEmail, fullName, studentId);
      basic.academicYear = academicYear;
      basic.yearLevel = yearLevel;
      if (cleanGpax) basic.gpax = cleanGpax;
      if (cleanPhone) basic.phone = cleanPhone;
      if (loanStatus) basic.hasStudentLoan = loanStatus;
      stmts.push(this.buildInsertBasicInfoStmt(createdId, basic));
      createdCount += 1;
    }

    for (let i = 0; i < stmts.length; i += 60) {
      await this.env.DB.batch(stmts.slice(i, i + 60));
    }

    return { createdCount, updatedCount, skippedCount, errors };
  }

  async getStudentBundle(studentUserId: string): Promise<StudentFullRecord | null> {
    const user = await this.findUserById(studentUserId);
    if (!user || user.role !== 'student') return null;

    const [basicRow, appRow, gradesRes, volsRes] = await Promise.all([
      this.env.DB.prepare('SELECT * FROM basic_infos WHERE student_user_id = ?')
        .bind(studentUserId)
        .first<BasicInfoRow>(),
      this.env.DB.prepare('SELECT * FROM applications WHERE student_user_id = ?')
        .bind(studentUserId)
        .first<ApplicationRow>(),
      this.env.DB.prepare(
        'SELECT * FROM grades WHERE student_user_id = ? ORDER BY academic_year ASC, semester ASC'
      )
        .bind(studentUserId)
        .all<GradeRow>(),
      this.env.DB.prepare(
        'SELECT * FROM volunteers WHERE student_user_id = ? ORDER BY created_at DESC'
      )
        .bind(studentUserId)
        .all<VolunteerRow>(),
    ]);

    return {
      user: sanitizeUser(user),
      basicInfo: rowToBasicInfo(basicRow, user),
      application: appRow ? rowToApplication(appRow) : null,
      grades: gradesRes.results.map(rowToGrade),
      volunteers: volsRes.results.map(rowToVolunteer),
    };
  }

  async getAllStudentBundles(): Promise<StudentFullRecord[]> {
    const [usersRes, basicsRes, appsRes, gradesRes, volsRes] = await Promise.all([
      this.env.DB.prepare(
        "SELECT * FROM users WHERE role = 'student' ORDER BY created_at ASC"
      ).all<UserRow>(),
      this.env.DB.prepare('SELECT * FROM basic_infos').all<BasicInfoRow>(),
      this.env.DB.prepare('SELECT * FROM applications').all<ApplicationRow>(),
      this.env.DB.prepare(
        'SELECT * FROM grades ORDER BY academic_year ASC, semester ASC'
      ).all<GradeRow>(),
      this.env.DB.prepare('SELECT * FROM volunteers ORDER BY created_at DESC').all<VolunteerRow>(),
    ]);

    const basicsMap = new Map(basicsRes.results.map((r) => [r.student_user_id, r]));
    const appsMap = new Map(appsRes.results.map((r) => [r.student_user_id, r]));
    const gradesMap = new Map<string, GradeRecord[]>();
    for (const row of gradesRes.results) {
      const list = gradesMap.get(row.student_user_id) || [];
      list.push(rowToGrade(row));
      gradesMap.set(row.student_user_id, list);
    }
    const volsMap = new Map<string, VolunteerRecord[]>();
    for (const row of volsRes.results) {
      const list = volsMap.get(row.student_user_id) || [];
      list.push(rowToVolunteer(row));
      volsMap.set(row.student_user_id, list);
    }

    return usersRes.results.map((userRow) => {
      const user = rowToUser(userRow);
      const appRow = appsMap.get(user.id);
      return {
        user: sanitizeUser(user),
        basicInfo: rowToBasicInfo(basicsMap.get(user.id) || null, user),
        application: appRow ? rowToApplication(appRow) : null,
        grades: gradesMap.get(user.id) || [],
        volunteers: volsMap.get(user.id) || [],
      };
    });
  }

  async getPublicOverview(
    academicYear: AcademicYear | 'all' = 'all',
    yearLevel: YearLevel | 'all' = 'all'
  ): Promise<PublicOverviewStats> {
    const bundles = await this.getAllStudentBundles();
    return buildPublicOverviewStats(bundles, academicYear, yearLevel);
  }

  async savePdpaDecision(studentUserId: string, consented: boolean): Promise<BasicInfoData> {
    const user = await this.findUserById(studentUserId);
    if (!user) throw new Error('ไม่พบบัญชีนักศึกษา');

    const existingRow = await this.env.DB.prepare(
      'SELECT * FROM basic_infos WHERE student_user_id = ?'
    )
      .bind(studentUserId)
      .first<BasicInfoRow>();

    const existing = rowToBasicInfo(existingRow, user);
    const updated: BasicInfoData = {
      ...existing,
      pdpaConsented: consented,
      pdpaDeclined: !consented,
      pdpaConsentedAt: consented ? new Date().toISOString() : existing.pdpaConsentedAt,
    };

    await this.buildInsertBasicInfoStmt(studentUserId, updated).run();
    return updated;
  }

  async saveBasicInfo(studentUserId: string, rawPayload: BasicInfoData): Promise<BasicInfoData> {
    const user = await this.findUserById(studentUserId);
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

    const nextFullName = payload.fullName?.trim() || user.fullName;
    const nextStudentId =
      payload.studentId?.trim() && /^\d{8}$/.test(payload.studentId.trim())
        ? payload.studentId.trim()
        : user.studentId || null;

    await this.env.DB.batch([
      this.env.DB.prepare('UPDATE users SET full_name = ?, student_id = ? WHERE id = ?').bind(
        nextFullName,
        nextStudentId,
        studentUserId
      ),
      this.buildInsertBasicInfoStmt(studentUserId, updated),
    ]);

    return updated;
  }

  async saveApplication(
    studentUserId: string,
    rawPayload: ScholarshipApplicationData,
    submitNow: boolean
  ): Promise<ScholarshipApplicationData> {
    const now = new Date().toISOString();
    const existingRow = await this.env.DB.prepare(
      'SELECT * FROM applications WHERE student_user_id = ?'
    )
      .bind(studentUserId)
      .first<ApplicationRow>();
    const existing = existingRow ? rowToApplication(existingRow) : null;
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

    await this.env.DB.prepare(
      `INSERT INTO applications (
        id, student_user_id, status, academic_year, year_level, gpax,
        advisor_comment, reviewed_by, reviewed_at, submitted_at, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_user_id) DO UPDATE SET
        status = excluded.status,
        academic_year = excluded.academic_year,
        year_level = excluded.year_level,
        gpax = excluded.gpax,
        advisor_comment = excluded.advisor_comment,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        submitted_at = excluded.submitted_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json`
    )
      .bind(
        updated.id,
        studentUserId,
        updated.status,
        updated.academicYear,
        updated.yearLevel,
        updated.gpax || '',
        updated.advisorComment || '',
        updated.reviewedBy || null,
        updated.reviewedAt || null,
        updated.submittedAt || null,
        updated.updatedAt,
        JSON.stringify(updated)
      )
      .run();

    return updated;
  }

  async reviewApplication(
    studentUserId: string,
    params: { status: ApplicationStatus; advisorComment: string; reviewerName: string }
  ): Promise<ScholarshipApplicationData> {
    const existingRow = await this.env.DB.prepare(
      'SELECT * FROM applications WHERE student_user_id = ?'
    )
      .bind(studentUserId)
      .first<ApplicationRow>();

    if (!existingRow) {
      throw new Error('นักศึกษายังไม่ได้บันทึกใบสมัครทุนการศึกษา');
    }
    const existing = rowToApplication(existingRow);
    const now = new Date().toISOString();
    const updated: ScholarshipApplicationData = {
      ...existing,
      status: params.status,
      advisorComment: params.advisorComment,
      reviewedBy: params.reviewerName,
      reviewedAt: now,
      updatedAt: now,
    };

    await this.env.DB.prepare(
      `UPDATE applications
       SET status = ?, advisor_comment = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?, payload_json = ?
       WHERE student_user_id = ?`
    )
      .bind(
        updated.status,
        updated.advisorComment,
        updated.reviewedBy || null,
        updated.reviewedAt || null,
        updated.updatedAt,
        JSON.stringify(updated),
        studentUserId
      )
      .run();

    return updated;
  }

  async upsertGradeRecord(params: {
    studentUserId: string;
    academicYear: AcademicYear;
    yearLevel: YearLevel;
    semester: SemesterType;
    gpa: string;
    attachments: UploadedFileMeta[];
    uploadedByRole: UserRole;
    uploadedByName: string;
  }): Promise<GradeRecord> {
    const user = await this.findUserById(params.studentUserId);
    if (!user) throw new Error('ไม่พบบัญชีนักศึกษา');
    const basicRow = await this.env.DB.prepare(
      'SELECT student_id, full_name FROM basic_infos WHERE student_user_id = ?'
    )
      .bind(params.studentUserId)
      .first<{ student_id: string; full_name: string }>();

    const now = new Date().toISOString();
    const existing = await this.env.DB.prepare(
      'SELECT * FROM grades WHERE student_user_id = ? AND academic_year = ? AND year_level = ? AND semester = ?'
    )
      .bind(params.studentUserId, params.academicYear, params.yearLevel, params.semester)
      .first<GradeRow>();

    if (existing) {
      await this.env.DB.prepare(
        `UPDATE grades
         SET gpa = ?, attachments_json = ?, uploaded_by_role = ?, uploaded_by_name = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(
          params.gpa,
          JSON.stringify(params.attachments || []),
          params.uploadedByRole,
          params.uploadedByName,
          now,
          existing.id
        )
        .run();

      return {
        ...rowToGrade(existing),
        gpa: params.gpa,
        attachments: params.attachments || [],
        uploadedByRole: params.uploadedByRole,
        uploadedByName: params.uploadedByName,
        updatedAt: now,
      };
    }

    const created: GradeRecord = {
      id: `grd_${crypto.randomUUID().slice(0, 8)}`,
      studentUserId: params.studentUserId,
      studentId: basicRow?.student_id || user.studentId || '-',
      studentName: basicRow?.full_name || user.fullName,
      academicYear: params.academicYear,
      yearLevel: params.yearLevel,
      semester: params.semester,
      gpa: params.gpa,
      attachments: params.attachments || [],
      uploadedByRole: params.uploadedByRole,
      uploadedByName: params.uploadedByName,
      createdAt: now,
      updatedAt: now,
    };

    await this.env.DB.prepare(
      `INSERT INTO grades (
        id, student_user_id, student_id, student_name, academic_year, year_level,
        semester, gpa, attachments_json, uploaded_by_role, uploaded_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        created.id,
        created.studentUserId,
        created.studentId,
        created.studentName,
        created.academicYear,
        created.yearLevel,
        created.semester,
        created.gpa,
        JSON.stringify(created.attachments),
        created.uploadedByRole,
        created.uploadedByName,
        created.createdAt,
        created.updatedAt
      )
      .run();

    return created;
  }

  async addVolunteerRecord(params: {
    studentUserId: string;
    academicYear: AcademicYear;
    activityTitle: string;
    activityDetail: string;
    learnings: string;
    hours: number;
    activityDate: string;
    dailyLifeApplication: string;
    photos: UploadedFileMeta[];
  }): Promise<VolunteerRecord> {
    const user = await this.findUserById(params.studentUserId);
    if (!user) throw new Error('ไม่พบบัญชีนักศึกษา');

    const app = await this.env.DB.prepare(
      'SELECT status FROM applications WHERE student_user_id = ?'
    )
      .bind(params.studentUserId)
      .first<{ status: ApplicationStatus }>();

    if (!app || app.status !== 'approved') {
      throw new Error('ระบบจิตอาสายังล็อกอยู่ จะเปิดใช้งานเมื่อได้รับอนุมัติทุนการศึกษาเรียบร้อยแล้ว');
    }

    const basicRow = await this.env.DB.prepare(
      'SELECT student_id, full_name FROM basic_infos WHERE student_user_id = ?'
    )
      .bind(params.studentUserId)
      .first<{ student_id: string; full_name: string }>();

    const record: VolunteerRecord = {
      id: `vol_${crypto.randomUUID().slice(0, 8)}`,
      studentUserId: params.studentUserId,
      studentId: basicRow?.student_id || user.studentId || '-',
      studentName: basicRow?.full_name || user.fullName,
      academicYear: params.academicYear,
      activityTitle: clampPayloadText(params.activityTitle, 400),
      activityDetail: clampPayloadText(params.activityDetail, 2000),
      learnings: clampPayloadText(params.learnings, 2000),
      hours: Number(params.hours),
      activityDate: clampPayloadText(params.activityDate, 80),
      dailyLifeApplication: clampPayloadText(params.dailyLifeApplication, 2000),
      photos: params.photos || [],
      approvalStatus: 'pending',
      approvedHours: 0,
      advisorNote: '',
      createdAt: new Date().toISOString(),
    };

    await this.env.DB.prepare(
      `INSERT INTO volunteers (
        id, student_user_id, student_id, student_name, academic_year, activity_title,
        activity_detail, learnings, hours, activity_date, daily_life_application,
        photos_json, approval_status, approved_hours, advisor_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        record.id,
        record.studentUserId,
        record.studentId,
        record.studentName,
        record.academicYear,
        record.activityTitle,
        record.activityDetail,
        record.learnings,
        record.hours,
        record.activityDate,
        record.dailyLifeApplication,
        JSON.stringify(record.photos),
        record.approvalStatus,
        record.approvedHours,
        record.advisorNote,
        record.createdAt
      )
      .run();

    return record;
  }

  async reviewVolunteerRecord(
    volunteerId: string,
    params: {
      approvalStatus: 'approved' | 'rejected' | 'pending';
      approvedHours: number;
      advisorNote: string;
      reviewerName: string;
    }
  ): Promise<VolunteerRecord> {
    const existing = await this.env.DB.prepare('SELECT * FROM volunteers WHERE id = ?')
      .bind(volunteerId)
      .first<VolunteerRow>();

    if (!existing) throw new Error('ไม่พบรายการจิตอาสา');

    const approvedHours = params.approvalStatus === 'approved' ? Number(params.approvedHours) : 0;
    const reviewedAt = new Date().toISOString();

    await this.env.DB.prepare(
      `UPDATE volunteers
       SET approval_status = ?, approved_hours = ?, advisor_note = ?, reviewed_by = ?, reviewed_at = ?
       WHERE id = ?`
    )
      .bind(
        params.approvalStatus,
        approvedHours,
        params.advisorNote,
        params.reviewerName,
        reviewedAt,
        volunteerId
      )
      .run();

    return {
      ...rowToVolunteer(existing),
      approvalStatus: params.approvalStatus,
      approvedHours,
      advisorNote: params.advisorNote,
      reviewedBy: params.reviewerName,
      reviewedAt,
    };
  }

  async saveUploadedFileToR2(params: {
    name: string;
    mimeType: string;
    base64Data: string;
  }): Promise<UploadedFileMeta> {
    const bytes = decodeBase64ToBytes(params.base64Data);
    const basename = String(params.name || 'file').split(/[\\/]/).pop() || 'file';
    const safeDisplayName = clampPayloadText(basename, 140) || 'file';

    const validation = validateUploadedBinary({
      name: safeDisplayName,
      mimeType: params.mimeType,
      bytes,
      maxBytes: MAX_SERVER_UPLOAD_BYTES,
    });
    if (!validation.valid || !validation.canonicalExt || !validation.canonicalMime) {
      throw new Error(validation.error || 'ไฟล์อัปโหลดไม่ถูกต้อง');
    }

    const safeFilename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${validation.canonicalExt}`;
    await this.env.BUCKET.put(safeFilename, bytes, {
      httpMetadata: {
        contentType: validation.canonicalMime,
        cacheControl: 'private, max-age=3600',
      },
      customMetadata: {
        originalName: safeDisplayName,
      },
    });

    return {
      id: `file_${crypto.randomUUID().slice(0, 8)}`,
      name: safeDisplayName,
      size: bytes.length,
      mimeType: validation.canonicalMime,
      url: `/uploads/${safeFilename}`,
      uploadedAt: new Date().toISOString(),
    };
  }

  async readUploadedFileFromR2(
    safeFilename: string
  ): Promise<{ buffer: ArrayBuffer; mimeType?: string } | null> {
    if (!isSafeUploadFilename(safeFilename)) {
      return null;
    }
    const obj = await this.env.BUCKET.get(safeFilename);
    if (!obj) return null;
    const buffer = await obj.arrayBuffer();
    return {
      buffer,
      mimeType: obj.httpMetadata?.contentType,
    };
  }
}
