import * as XLSX from 'xlsx';
import type {
  AcademicYear,
  ApplicationStatus,
  BasicInfoData,
  GoogleWorkspaceConfig,
  GradeRecord,
  ImportedStudentRow,
  ImportStudentsResult,
  PublicOverviewStats,
  RestoreSnapshotResult,
  ScholarshipApplicationData,
  SemesterType,
  StudentFullRecord,
  SystemSnapshotPayload,
  UploadedFileMeta,
  UserAccount,
  UserRole,
  VolunteerRecord,
  YearLevel,
} from '../types/scholarship';
import {
  buildDefaultStudentPassword,
  buildPublicOverviewStats,
  calculateApprovedVolunteerHours,
  canDeleteUserAccount,
  createEmptyBasicInfo,
  evaluateLoginAttemptStatus,
  formatReceivedScholarshipsText,
  getApplicationStatusMeta,
  prefillApplicationFromBasicInfo,
  recordFailedAttemptState,
  sanitizeCsvCell,
  validateAdminSetupPayload,
  validatePasswordChangePayload,
  validateStudentId,
  validateStudentRegistrationPayload,
} from '../utils/scholarshipLogic';
import { clampPayloadText, sanitizeWorkspaceConfigInput } from '../utils/securityGuard';
import {
  CURRENT_USER_SESSION_KEY,
  extractAllApplicationRowsForSync,
  extractAllGradeRowsForSync,
  extractAllStudentRowsForSync,
  extractAllVolunteerRowsForSync,
  getCachedDatabaseState,
  getSessionCurrentUserId,
  hashPasswordClient,
  loadAllDatabaseFromSheets,
  serializeAdminOrUserRow,
  serializeScholarshipRows,
  serializeSettingsRows,
  setSessionCurrentUserId,
  type HydratedDatabaseState,
  type StoredUserRecord,
  uploadFileToSheetsDrive,
  verifyPasswordClient,
} from './googleSheetsDb';

async function ensureState(forceRefresh = false): Promise<HydratedDatabaseState> {
  return loadAllDatabaseFromSheets(forceRefresh);
}

function getTeacherNamesFromState(state: HydratedDatabaseState): string[] {
  const names: string[] = [];
  for (const u of state.users) {
    if (u.role === 'teacher' && u.fullName) {
      names.push(u.fullName);
    }
  }
  return names;
}

function findUserInState(state: HydratedDatabaseState, userId: string): StoredUserRecord | null {
  return state.allUsersMap.get(userId) || state.studentAuthMap.get(userId) || null;
}

function toUserAccount(u: StoredUserRecord): UserAccount {
  return {
    id: u.id,
    role: u.role,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    studentId: u.studentId,
    authProvider: u.authProvider,
    hasPassword: Boolean(u.hasPassword || u.passwordHash || u.plainPasswordFallback),
    mustChangePassword: Boolean(u.mustChangePassword),
    passwordChangedAt: u.passwordChangedAt,
    failedLoginAttempts: u.failedLoginAttempts ?? 0,
    lockedUntil: u.lockedUntil,
    createdAt: u.createdAt,
  };
}

function requireCurrentUser(state: HydratedDatabaseState): StoredUserRecord {
  const uid = getSessionCurrentUserId();
  if (!uid) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ');
  }
  const user = findUserInState(state, uid);
  if (!user) {
    setSessionCurrentUserId(null);
    throw new Error('เซสชันหมดอายุหรือไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่');
  }
  return user;
}

function findStudentIndex(state: HydratedDatabaseState, userId: string): number {
  return state.students.findIndex((s) => s.user.id === userId);
}

async function syncAuthRecord(state: HydratedDatabaseState, user: StoredUserRecord) {
  const { syncTableToSheets } = await import('./googleSheetsDb');
  if (user.role === 'admin') {
    const idx = state.admins.findIndex((a) => a.id === user.id);
    if (idx >= 0) state.admins[idx] = user;
    else state.admins.push(user);
    state.allUsersMap.set(user.id, user);
    await syncTableToSheets('Admins', state.admins.map(serializeAdminOrUserRow));
  } else if (user.role === 'teacher') {
    const idx = state.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) state.users[idx] = user;
    else state.users.push(user);
    state.allUsersMap.set(user.id, user);
    await syncTableToSheets('Users', state.users.map(serializeAdminOrUserRow));
  } else {
    state.studentAuthMap.set(user.id, user);
    state.allUsersMap.set(user.id, user);
    const sIdx = findStudentIndex(state, user.id);
    if (sIdx >= 0) {
      state.students[sIdx] = {
        ...state.students[sIdx],
        user: toUserAccount(user),
      };
    }
    await syncTableToSheets('Students', extractAllStudentRowsForSync(state));
  }
}

export const api = {
  async loadAllDatabase(forceRefresh = true): Promise<HydratedDatabaseState> {
    return loadAllDatabaseFromSheets(forceRefresh);
  },

  getCurrentSessionKeyName(): string {
    return CURRENT_USER_SESSION_KEY;
  },

  getCurrentSessionStudentId(): string {
    const uid = getSessionCurrentUserId();
    const state = getCachedDatabaseState();
    if (uid && state) {
      const user = findUserInState(state, uid);
      if (user?.studentId) return user.studentId;
      const stu = state.students.find((s) => s.user.id === uid);
      if (stu?.basicInfo.studentId) return stu.basicInfo.studentId;
      if (stu?.user.studentId) return stu.user.studentId;
    }
    return 'general';
  },

  async getAuthStatus(): Promise<{ adminInitialized: boolean; studentAuthMode?: string }> {
    const state = await ensureState(false);
    const hasAdmin =
      state.admins.length > 0 || state.users.some((u) => u.role === 'admin');
    return {
      adminInitialized: hasAdmin,
      studentAuthMode: 'student_id',
    };
  },

  async getPublicOverview(
    academicYear: AcademicYear | 'all' = 'all',
    yearLevel: YearLevel | 'all' = 'all'
  ): Promise<{ overview: PublicOverviewStats }> {
    const state = await ensureState(false);
    return {
      overview: buildPublicOverviewStats(state.students, academicYear, yearLevel),
    };
  },

  async getMe(): Promise<{ user: UserAccount | null }> {
    const state = await ensureState(false);
    const uid = getSessionCurrentUserId();
    if (!uid) return { user: null };
    const found = findUserInState(state, uid);
    if (!found) {
      setSessionCurrentUserId(null);
      return { user: null };
    }
    return { user: toUserAccount(found) };
  },

  async logout(): Promise<{ ok: boolean }> {
    setSessionCurrentUserId(null);
    return { ok: true };
  },

  async deleteMyAccount(): Promise<{ ok: boolean }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    const adminCount = state.admins.length + state.users.filter((u) => u.role === 'admin').length;
    const perm = canDeleteUserAccount({
      actorRole: actor.role,
      actorUserId: actor.id,
      targetUserId: actor.id,
      targetRole: actor.role,
      adminCount,
    });
    if (!perm.allowed) {
      throw new Error(perm.reason || 'ไม่สามารถลบบัญชีนี้ได้');
    }

    const { syncTableToSheets } = await import('./googleSheetsDb');
    if (actor.role === 'student') {
      state.students = state.students.filter((s) => s.user.id !== actor.id);
      state.studentAuthMap.delete(actor.id);
      state.allUsersMap.delete(actor.id);
      await Promise.all([
        syncTableToSheets('Students', extractAllStudentRowsForSync(state)),
        syncTableToSheets('Applications', extractAllApplicationRowsForSync(state)),
        syncTableToSheets('Grades', extractAllGradeRowsForSync(state)),
        syncTableToSheets('VolunteerLogs', extractAllVolunteerRowsForSync(state)),
        syncTableToSheets('Scholarships', serializeScholarshipRows(state.students)),
      ]);
    } else if (actor.role === 'teacher') {
      state.users = state.users.filter((u) => u.id !== actor.id);
      state.allUsersMap.delete(actor.id);
      await syncTableToSheets('Users', state.users.map(serializeAdminOrUserRow));
    }

    setSessionCurrentUserId(null);
    return { ok: true };
  },

  async setupFirstAdmin(payload: {
    username: string;
    password: string;
    confirmPassword?: string;
    fullName: string;
  }): Promise<{ user: UserAccount }> {
    const state = await ensureState(true);
    if (state.admins.length > 0 || state.users.some((u) => u.role === 'admin')) {
      throw new Error('ระบบได้ตั้งค่าผู้ดูแลระบบครั้งแรกเรียบร้อยแล้ว กรุณาเข้าสู่ระบบตามปกติ');
    }

    const check = validateAdminSetupPayload(payload);
    if (!check.valid) {
      throw new Error(check.error || 'ข้อมูลผู้ดูแลระบบไม่ถูกต้อง');
    }

    const passwordHash = await hashPasswordClient(payload.password);
    const now = new Date().toISOString();
    const adminUser: StoredUserRecord = {
      id: `adm_${check.normalizedUsername}`,
      role: 'admin',
      username: check.normalizedUsername,
      fullName: check.normalizedFullName,
      authProvider: 'password',
      hasPassword: true,
      mustChangePassword: false,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      createdAt: now,
      passwordHash,
    };

    state.admins.push(adminUser);
    state.allUsersMap.set(adminUser.id, adminUser);

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Admins', state.admins.map(serializeAdminOrUserRow));

    setSessionCurrentUserId(adminUser.id);
    return { user: toUserAccount(adminUser) };
  },

  async registerTeacher(payload: {
    username: string;
    password: string;
    fullName: string;
  }): Promise<{ user: UserAccount }> {
    const state = await ensureState(true);
    const username = String(payload.username || '').trim().toLowerCase();
    const fullName = clampPayloadText(payload.fullName || '', 120).trim();
    const password = String(payload.password || '');

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new Error('ชื่อผู้ใช้งานต้องมี 3-40 ตัวอักษร (ภาษาอังกฤษ ตัวเลข . _ -)');
    }
    if (fullName.length < 2) {
      throw new Error('กรุณากรอกชื่อ-นามสกุลอาจารย์');
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวอักษรและตัวเลข');
    }

    const dup = [...state.admins, ...state.users].some(
      (u) => u.username.toLowerCase() === username
    );
    if (dup) {
      throw new Error(`ชื่อผู้ใช้งาน "${username}" ถูกใช้งานแล้ว`);
    }

    const passwordHash = await hashPasswordClient(password);
    const now = new Date().toISOString();
    const teacherUser: StoredUserRecord = {
      id: `tch_${username}_${Date.now().toString(36)}`,
      role: 'teacher',
      username,
      fullName,
      authProvider: 'password',
      hasPassword: true,
      mustChangePassword: false,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      createdAt: now,
      passwordHash,
    };

    state.users.push(teacherUser);
    state.allUsersMap.set(teacherUser.id, teacherUser);

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Users', state.users.map(serializeAdminOrUserRow));

    setSessionCurrentUserId(teacherUser.id);
    return { user: toUserAccount(teacherUser) };
  },

  async registerStudentById(payload: {
    studentId: string;
    fullName?: string;
    yearLevel?: YearLevel;
    academicYear?: AcademicYear;
  }): Promise<{ user: UserAccount }> {
    const state = await ensureState(true);
    const check = validateStudentRegistrationPayload({
      studentId: payload.studentId,
      fullName: payload.fullName,
    });
    if (!check.valid) {
      throw new Error(check.error || 'รหัสนักศึกษาไม่ถูกต้อง');
    }

    const studentId = check.normalizedStudentId;
    const exists = state.students.some(
      (s) =>
        (s.basicInfo.studentId || s.user.studentId || s.user.username).toLowerCase() ===
        studentId.toLowerCase()
    );
    if (exists) {
      throw new Error(`รหัสนักศึกษา ${studentId} มีบัญชีในระบบแล้ว กรุณาเข้าสู่ระบบตามปกติ`);
    }

    const defaultPassword = buildDefaultStudentPassword(studentId);
    const passwordHash = await hashPasswordClient(defaultPassword);
    const now = new Date().toISOString();
    const fullName =
      clampPayloadText(payload.fullName || '', 120).trim() || `นักศึกษา ${studentId}`;
    const userId = `stu_${studentId}`;

    const studentUser: StoredUserRecord = {
      id: userId,
      role: 'student',
      username: studentId.toLowerCase(),
      fullName,
      studentId,
      authProvider: 'student_id',
      hasPassword: true,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      createdAt: now,
      passwordHash,
    };

    const basicInfo = createEmptyBasicInfo('', fullName, studentId);
    if (payload.academicYear) basicInfo.academicYear = payload.academicYear;
    if (payload.yearLevel) basicInfo.yearLevel = payload.yearLevel;

    state.studentAuthMap.set(userId, studentUser);
    state.allUsersMap.set(userId, studentUser);
    state.students.push({
      user: toUserAccount(studentUser),
      basicInfo,
      application: null,
      grades: [],
      volunteers: [],
    });

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Students', extractAllStudentRowsForSync(state));

    setSessionCurrentUserId(userId);
    return { user: toUserAccount(studentUser) };
  },

  async loginStudent(payload: {
    studentId: string;
    password: string;
  }): Promise<{ user: UserAccount }> {
    const state = await ensureState(true);
    const idCheck = validateStudentId(payload.studentId);
    if (!idCheck.valid) {
      throw new Error(idCheck.error || 'รหัสนักศึกษาไม่ถูกต้อง');
    }

    const normalizedId = idCheck.normalized.toLowerCase();
    const match =
      Array.from(state.studentAuthMap.values()).find(
        (u) =>
          (u.studentId || '').toLowerCase() === normalizedId ||
          u.username.toLowerCase() === normalizedId
      ) ||
      state.users.find(
        (u) =>
          u.role === 'student' &&
          ((u.studentId || '').toLowerCase() === normalizedId ||
            u.username.toLowerCase() === normalizedId)
      );

    if (!match) {
      throw new Error('ไม่พบบัญชีรหัสนักศึกษานี้ในระบบ กรุณากดสมัครสมาชิกหรือติดต่อผู้ดูแลระบบ');
    }

    const lockStatus = evaluateLoginAttemptStatus({
      failedLoginAttempts: match.failedLoginAttempts,
      lockedUntil: match.lockedUntil,
    });
    if (lockStatus.isLocked) {
      throw new Error(lockStatus.errorMessage);
    }

    const valid = await verifyPasswordClient(
      payload.password,
      match.passwordHash,
      match.plainPasswordFallback
    );

    if (!valid) {
      const failNext = recordFailedAttemptState({
        failedLoginAttempts: match.failedLoginAttempts,
        lockedUntil: match.lockedUntil,
      });
      match.failedLoginAttempts = failNext.failedLoginAttempts;
      match.lockedUntil = failNext.lockedUntil;
      await syncAuthRecord(state, match).catch(() => {});
      throw new Error(failNext.errorMessage);
    }

    if (match.failedLoginAttempts || match.lockedUntil) {
      match.failedLoginAttempts = 0;
      match.lockedUntil = undefined;
      await syncAuthRecord(state, match).catch(() => {});
    }

    setSessionCurrentUserId(match.id);
    return { user: toUserAccount(match) };
  },

  async loginPassword(payload: {
    role: UserRole;
    username: string;
    password: string;
  }): Promise<{ user: UserAccount }> {
    const state = await ensureState(true);
    const username = String(payload.username || '').trim().toLowerCase();
    const candidates =
      payload.role === 'admin'
        ? [...state.admins, ...state.users.filter((u) => u.role === 'admin')]
        : payload.role === 'teacher'
          ? state.users.filter((u) => u.role === 'teacher')
          : Array.from(state.studentAuthMap.values());

    const match = candidates.find(
      (u) =>
        u.username.toLowerCase() === username ||
        (u.studentId && u.studentId.toLowerCase() === username) ||
        (u.email && u.email.toLowerCase() === username)
    );

    if (!match) {
      throw new Error('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
    }

    const lockStatus = evaluateLoginAttemptStatus({
      failedLoginAttempts: match.failedLoginAttempts,
      lockedUntil: match.lockedUntil,
    });
    if (lockStatus.isLocked) {
      throw new Error(lockStatus.errorMessage);
    }

    const valid = await verifyPasswordClient(
      payload.password,
      match.passwordHash,
      match.plainPasswordFallback
    );

    if (!valid) {
      const failNext = recordFailedAttemptState({
        failedLoginAttempts: match.failedLoginAttempts,
        lockedUntil: match.lockedUntil,
      });
      match.failedLoginAttempts = failNext.failedLoginAttempts;
      match.lockedUntil = failNext.lockedUntil;
      await syncAuthRecord(state, match).catch(() => {});
      throw new Error(failNext.errorMessage);
    }

    if (match.failedLoginAttempts || match.lockedUntil) {
      match.failedLoginAttempts = 0;
      match.lockedUntil = undefined;
      await syncAuthRecord(state, match).catch(() => {});
    }

    setSessionCurrentUserId(match.id);
    return { user: toUserAccount(match) };
  },

  async changePassword(payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ ok: boolean; message: string; user: UserAccount }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);

    const check = validatePasswordChangePayload(payload);
    if (!check.valid) {
      throw new Error(check.error || 'รหัสผ่านใหม่ไม่เป็นไปตามเงื่อนไขความปลอดภัย');
    }

    const validCurrent = await verifyPasswordClient(
      payload.currentPassword,
      actor.passwordHash,
      actor.plainPasswordFallback
    );
    if (!validCurrent) {
      throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }

    actor.passwordHash = await hashPasswordClient(payload.newPassword);
    actor.plainPasswordFallback = undefined;
    actor.hasPassword = true;
    actor.mustChangePassword = false;
    actor.passwordChangedAt = new Date().toISOString();
    actor.failedLoginAttempts = 0;
    actor.lockedUntil = undefined;

    await syncAuthRecord(state, actor);

    return {
      ok: true,
      message: 'เปลี่ยนรหัสผ่านสำเร็จแล้ว และบันทึกข้อมูลลง Google Sheets เรียบร้อย',
      user: toUserAccount(actor),
    };
  },

  async uploadFile(file: File, studentId?: string): Promise<UploadedFileMeta> {
    const effectiveStudentId = studentId?.trim() || api.getCurrentSessionStudentId();
    return uploadFileToSheetsDrive(file, effectiveStudentId);
  },

  // Student endpoints
  async getMyStudentBundle(): Promise<{ bundle: StudentFullRecord; teacherNames?: string[] }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    const bundle = state.students.find((s) => s.user.id === actor.id);
    if (!bundle) {
      throw new Error('ไม่พบข้อมูลนักศึกษาในฐานข้อมูล Google Sheets');
    }
    return {
      bundle,
      teacherNames: getTeacherNamesFromState(state),
    };
  },

  async savePdpaDecision(consented: boolean): Promise<{ basicInfo: BasicInfoData }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    const idx = findStudentIndex(state, actor.id);
    if (idx < 0) {
      throw new Error('ไม่พบข้อมูลนักศึกษา');
    }

    const currentBasic = state.students[idx].basicInfo;
    const nextBasic: BasicInfoData = {
      ...currentBasic,
      pdpaConsented: Boolean(consented),
      pdpaConsentedAt: consented ? new Date().toISOString() : undefined,
      pdpaDeclined: !consented,
    };

    state.students[idx] = {
      ...state.students[idx],
      basicInfo: nextBasic,
    };

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await Promise.all([
      syncTableToSheets('Students', extractAllStudentRowsForSync(state)),
      syncTableToSheets('Scholarships', serializeScholarshipRows(state.students)),
    ]);

    return { basicInfo: nextBasic };
  },

  async saveBasicInfo(basicInfo: BasicInfoData): Promise<{ basicInfo: BasicInfoData }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    const idx = findStudentIndex(state, actor.id);
    if (idx < 0) {
      throw new Error('ไม่พบข้อมูลนักศึกษา');
    }

    const nextBasic: BasicInfoData = {
      ...basicInfo,
      studentId: basicInfo.studentId || actor.studentId || state.students[idx].basicInfo.studentId,
      supportingDocs: [],
      documentNote: '',
      savedAt: new Date().toISOString(),
    };

    actor.fullName = nextBasic.fullName || actor.fullName;
    actor.email = nextBasic.email || actor.email;
    state.studentAuthMap.set(actor.id, actor);
    state.allUsersMap.set(actor.id, actor);

    state.students[idx] = {
      ...state.students[idx],
      user: toUserAccount(actor),
      basicInfo: nextBasic,
    };

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await Promise.all([
      syncTableToSheets('Students', extractAllStudentRowsForSync(state)),
      syncTableToSheets('Scholarships', serializeScholarshipRows(state.students)),
    ]);

    return { basicInfo: nextBasic };
  },

  async saveApplication(
    application: ScholarshipApplicationData,
    submitNow: boolean
  ): Promise<{ application: ScholarshipApplicationData }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    const idx = findStudentIndex(state, actor.id);
    if (idx < 0) {
      throw new Error('ไม่พบข้อมูลนักศึกษา');
    }

    const now = new Date().toISOString();
    const currentApp = state.students[idx].application;
    const nextStatus: ApplicationStatus = submitNow
      ? currentApp?.status === 'approved'
        ? 'approved'
        : 'submitted'
      : currentApp?.status === 'approved'
        ? 'approved'
        : application.status || 'draft';

    const nextApp: ScholarshipApplicationData = {
      ...application,
      id: application.id || `app_${actor.id}`,
      studentUserId: actor.id,
      status: nextStatus,
      submittedAt: submitNow ? now : application.submittedAt || currentApp?.submittedAt,
      updatedAt: now,
    };

    state.students[idx] = {
      ...state.students[idx],
      application: nextApp,
    };

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Applications', extractAllApplicationRowsForSync(state));

    return { application: nextApp };
  },

  async saveGradeRecord(payload: {
    academicYear: AcademicYear;
    yearLevel: YearLevel;
    semester: SemesterType;
    gpa: string;
    attachments: UploadedFileMeta[];
  }): Promise<{ grade: GradeRecord }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    const idx = findStudentIndex(state, actor.id);
    if (idx < 0) {
      throw new Error('ไม่พบข้อมูลนักศึกษา');
    }

    const student = state.students[idx];
    const now = new Date().toISOString();
    const existingIdx = student.grades.findIndex(
      (g) =>
        g.academicYear === payload.academicYear &&
        g.yearLevel === payload.yearLevel &&
        g.semester === payload.semester
    );

    const grade: GradeRecord = {
      id: existingIdx >= 0 ? student.grades[existingIdx].id : `grd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      studentUserId: actor.id,
      studentId: student.basicInfo.studentId || student.user.studentId || '',
      studentName: student.basicInfo.fullName || student.user.fullName,
      academicYear: payload.academicYear,
      yearLevel: payload.yearLevel,
      semester: payload.semester,
      gpa: payload.gpa.trim(),
      attachments: payload.attachments || [],
      uploadedByRole: actor.role,
      uploadedByName: actor.fullName,
      createdAt: existingIdx >= 0 ? student.grades[existingIdx].createdAt : now,
      updatedAt: now,
    };

    const nextGrades = [...student.grades];
    if (existingIdx >= 0) nextGrades[existingIdx] = grade;
    else nextGrades.push(grade);

    state.students[idx] = {
      ...student,
      grades: nextGrades,
    };

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Grades', extractAllGradeRowsForSync(state));

    return { grade };
  },

  async submitVolunteer(payload: {
    academicYear: AcademicYear;
    activityTitle: string;
    activityDetail: string;
    learnings: string;
    hours: number;
    activityDate: string;
    dailyLifeApplication: string;
    photos: UploadedFileMeta[];
  }): Promise<{ volunteer: VolunteerRecord }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    const idx = findStudentIndex(state, actor.id);
    if (idx < 0) {
      throw new Error('ไม่พบข้อมูลนักศึกษา');
    }

    const student = state.students[idx];
    const now = new Date().toISOString();
    const volunteer: VolunteerRecord = {
      id: `vol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      studentUserId: actor.id,
      studentId: student.basicInfo.studentId || student.user.studentId || '',
      studentName: student.basicInfo.fullName || student.user.fullName,
      academicYear: payload.academicYear,
      activityTitle: payload.activityTitle.trim(),
      activityDetail: payload.activityDetail.trim(),
      learnings: payload.learnings.trim(),
      hours: Number(payload.hours || 0),
      activityDate: payload.activityDate,
      dailyLifeApplication: payload.dailyLifeApplication.trim(),
      photos: payload.photos || [],
      approvalStatus: 'pending',
      approvedHours: 0,
      advisorNote: '',
      createdAt: now,
    };

    state.students[idx] = {
      ...student,
      volunteers: [...student.volunteers, volunteer],
    };

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('VolunteerLogs', extractAllVolunteerRowsForSync(state));

    return { volunteer };
  },

  // Staff (Teacher + Admin)
  async getAllStudents(): Promise<{ students: StudentFullRecord[]; teacherNames?: string[] }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin' && actor.role !== 'teacher') {
      throw new Error('ไม่มีสิทธิ์เข้าถึงรายชื่อนักศึกษาทั้งหมด');
    }
    return {
      students: state.students,
      teacherNames: getTeacherNamesFromState(state),
    };
  },

  async importStudentsExcel(rows: ImportedStudentRow[]): Promise<{ result: ImportStudentsResult }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin' && actor.role !== 'teacher') {
      throw new Error('ไม่มีสิทธิ์นำเข้ารายชื่อนักศึกษา');
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const idCheck = validateStudentId(row.studentId);
      if (!idCheck.valid) {
        skippedCount += 1;
        errors.push(idCheck.error || `รหัสนักศึกษา "${row.studentId}" ไม่ถูกต้อง`);
        continue;
      }

      const sid = idCheck.normalized;
      const existingIdx = state.students.findIndex(
        (s) =>
          (s.basicInfo.studentId || s.user.studentId || s.user.username).toLowerCase() ===
          sid.toLowerCase()
      );

      if (existingIdx >= 0) {
        const existing = state.students[existingIdx];
        const authUser = state.studentAuthMap.get(existing.user.id) || {
          ...existing.user,
        };
        if (row.fullName) authUser.fullName = row.fullName;
        if (row.email) authUser.email = row.email;
        if (row.password) {
          authUser.passwordHash = await hashPasswordClient(row.password);
          authUser.plainPasswordFallback = undefined;
          authUser.hasPassword = true;
          authUser.mustChangePassword = true;
        }
        state.studentAuthMap.set(authUser.id, authUser);
        state.allUsersMap.set(authUser.id, authUser);

        const nextBasic: BasicInfoData = {
          ...existing.basicInfo,
          studentId: sid,
          fullName: row.fullName || existing.basicInfo.fullName,
          email: row.email ?? existing.basicInfo.email,
          academicYear: row.academicYear || existing.basicInfo.academicYear,
          yearLevel: row.yearLevel || existing.basicInfo.yearLevel,
          gpax: row.gpax ?? existing.basicInfo.gpax,
          phone: row.phone ?? existing.basicInfo.phone,
          hasStudentLoan: row.hasStudentLoan ?? existing.basicInfo.hasStudentLoan,
        };

        state.students[existingIdx] = {
          ...existing,
          user: toUserAccount(authUser),
          basicInfo: nextBasic,
        };
        updatedCount += 1;
      } else {
        const now = new Date().toISOString();
        const rawPassword = row.password || buildDefaultStudentPassword(sid);
        const shouldHashNow = Boolean(row.password) || rows.length <= 20;
        const passwordHash = shouldHashNow ? await hashPasswordClient(rawPassword) : '';
        const userId = `stu_${sid}`;
        const studentUser: StoredUserRecord = {
          id: userId,
          role: 'student',
          username: sid.toLowerCase(),
          email: row.email,
          fullName: row.fullName,
          studentId: sid,
          authProvider: 'student_id',
          hasPassword: true,
          mustChangePassword: true,
          failedLoginAttempts: 0,
          createdAt: now,
          passwordHash,
          ...(shouldHashNow ? {} : { plainPasswordFallback: rawPassword }),
        };

        const basicInfo = createEmptyBasicInfo(row.email || '', row.fullName, sid);
        basicInfo.academicYear = row.academicYear;
        basicInfo.yearLevel = row.yearLevel;
        if (row.gpax) basicInfo.gpax = row.gpax;
        if (row.phone) basicInfo.phone = row.phone;
        if (row.hasStudentLoan) basicInfo.hasStudentLoan = row.hasStudentLoan;

        state.studentAuthMap.set(userId, studentUser);
        state.allUsersMap.set(userId, studentUser);
        state.students.push({
          user: toUserAccount(studentUser),
          basicInfo,
          application: null,
          grades: [],
          volunteers: [],
        });
        createdCount += 1;
      }
    }

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Students', extractAllStudentRowsForSync(state));

    return {
      result: {
        createdCount,
        updatedCount,
        skippedCount,
        errors,
      },
    };
  },

  async createStudentRecord(row: ImportedStudentRow): Promise<{ result: ImportStudentsResult }> {
    return api.importStudentsExcel([row]);
  },

  async reviewApplication(
    studentUserId: string,
    payload: { status: ApplicationStatus; advisorComment: string }
  ): Promise<{ application: ScholarshipApplicationData }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin' && actor.role !== 'teacher') {
      throw new Error('ไม่มีสิทธิ์พิจารณาคำร้องขอทุนการศึกษา');
    }

    const idx = findStudentIndex(state, studentUserId);
    if (idx < 0) {
      throw new Error('ไม่พบข้อมูลนักศึกษา');
    }

    const student = state.students[idx];
    const baseApp =
      student.application ||
      prefillApplicationFromBasicInfo(student.basicInfo, null, student.user.id);
    const now = new Date().toISOString();

    const nextApp: ScholarshipApplicationData = {
      ...baseApp,
      status: payload.status,
      advisorComment: payload.advisorComment,
      reviewedBy: actor.fullName,
      reviewedAt: now,
      updatedAt: now,
    };

    state.students[idx] = {
      ...student,
      application: nextApp,
    };

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Applications', extractAllApplicationRowsForSync(state));

    return { application: nextApp };
  },

  async reviewVolunteer(
    volunteerId: string,
    payload: {
      approvalStatus: 'approved' | 'rejected' | 'pending';
      approvedHours: number;
      advisorNote: string;
    }
  ): Promise<{ volunteer: VolunteerRecord }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin' && actor.role !== 'teacher') {
      throw new Error('ไม่มีสิทธิ์รับรองกิจกรรมจิตอาสา');
    }

    let updatedRecord: VolunteerRecord | null = null;
    const now = new Date().toISOString();

    for (let i = 0; i < state.students.length; i += 1) {
      const vIdx = state.students[i].volunteers.findIndex((v) => v.id === volunteerId);
      if (vIdx >= 0) {
        const current = state.students[i].volunteers[vIdx];
        updatedRecord = {
          ...current,
          approvalStatus: payload.approvalStatus,
          approvedHours:
            payload.approvalStatus === 'approved'
              ? Number(payload.approvedHours || current.hours || 0)
              : 0,
          advisorNote: payload.advisorNote,
          reviewedBy: actor.fullName,
          reviewedAt: now,
        };
        const nextVols = [...state.students[i].volunteers];
        nextVols[vIdx] = updatedRecord;
        state.students[i] = {
          ...state.students[i],
          volunteers: nextVols,
        };
        break;
      }
    }

    if (!updatedRecord) {
      throw new Error('ไม่พบบันทึกกิจกรรมจิตอาสา');
    }

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('VolunteerLogs', extractAllVolunteerRowsForSync(state));

    return { volunteer: updatedRecord };
  },

  async staffAttachGrade(
    studentUserId: string,
    payload: {
      academicYear: AcademicYear;
      yearLevel: YearLevel;
      semester: SemesterType;
      gpa: string;
      attachments: UploadedFileMeta[];
    }
  ): Promise<{ grade: GradeRecord }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin' && actor.role !== 'teacher') {
      throw new Error('ไม่มีสิทธิ์บันทึกผลการเรียน');
    }

    const idx = findStudentIndex(state, studentUserId);
    if (idx < 0) {
      throw new Error('ไม่พบข้อมูลนักศึกษา');
    }

    const student = state.students[idx];
    const now = new Date().toISOString();
    const existingIdx = student.grades.findIndex(
      (g) =>
        g.academicYear === payload.academicYear &&
        g.yearLevel === payload.yearLevel &&
        g.semester === payload.semester
    );

    const grade: GradeRecord = {
      id: existingIdx >= 0 ? student.grades[existingIdx].id : `grd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      studentUserId: student.user.id,
      studentId: student.basicInfo.studentId || student.user.studentId || '',
      studentName: student.basicInfo.fullName || student.user.fullName,
      academicYear: payload.academicYear,
      yearLevel: payload.yearLevel,
      semester: payload.semester,
      gpa: payload.gpa.trim(),
      attachments: payload.attachments || [],
      uploadedByRole: actor.role,
      uploadedByName: actor.fullName,
      createdAt: existingIdx >= 0 ? student.grades[existingIdx].createdAt : now,
      updatedAt: now,
    };

    const nextGrades = [...student.grades];
    if (existingIdx >= 0) nextGrades[existingIdx] = grade;
    else nextGrades.push(grade);

    state.students[idx] = {
      ...student,
      grades: nextGrades,
    };

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Grades', extractAllGradeRowsForSync(state));

    return { grade };
  },

  // Admin
  async getAdminUsers(): Promise<{ users: UserAccount[] }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin') {
      throw new Error('เฉพาะผู้ดูแลระบบเท่านั้น');
    }

    const list: UserAccount[] = [
      ...state.admins.map(toUserAccount),
      ...state.users.map(toUserAccount),
      ...state.students.map((s) => s.user),
    ];

    const dedup = new Map<string, UserAccount>();
    for (const u of list) {
      dedup.set(u.id, u);
    }
    return { users: Array.from(dedup.values()) };
  },

  async resetUserPassword(
    userId: string,
    payload: string | { resetToDefault?: boolean; newPassword?: string }
  ): Promise<{ user: UserAccount; message?: string }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin') {
      throw new Error('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถรีเซ็ตรหัสผ่านได้');
    }

    const target = findUserInState(state, userId);
    if (!target) {
      throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    }

    const opts = typeof payload === 'string' ? { newPassword: payload } : payload;
    let nextPassword = opts.newPassword?.trim() || '';
    if (opts.resetToDefault) {
      nextPassword =
        target.studentId ||
        buildDefaultStudentPassword(target.username) ||
        target.username;
    }
    if (!nextPassword) {
      throw new Error('กรุณาระบุรหัสผ่านใหม่');
    }

    target.passwordHash = await hashPasswordClient(nextPassword);
    target.plainPasswordFallback = undefined;
    target.hasPassword = true;
    target.mustChangePassword = target.role === 'student' ? true : false;
    target.failedLoginAttempts = 0;
    target.lockedUntil = undefined;
    target.passwordChangedAt = new Date().toISOString();

    await syncAuthRecord(state, target);

    return {
      user: toUserAccount(target),
      message: `รีเซ็ตรหัสผ่านของ "${target.fullName}" และอัปเดตลง Google Sheets เรียบร้อยแล้ว`,
    };
  },

  async adminCreateUser(payload: {
    role: UserRole;
    username: string;
    password?: string;
    fullName: string;
    studentId?: string;
  }): Promise<{ user: UserAccount }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin') {
      throw new Error('เฉพาะผู้ดูแลระบบเท่านั้น');
    }

    const fullName = clampPayloadText(payload.fullName || '', 120).trim();
    if (!fullName) throw new Error('กรุณากรอกชื่อ-นามสกุล');

    const now = new Date().toISOString();
    const { syncTableToSheets } = await import('./googleSheetsDb');

    if (payload.role === 'student') {
      const sid = String(payload.studentId || payload.username || '').trim();
      const idCheck = validateStudentId(sid);
      if (!idCheck.valid) {
        throw new Error(idCheck.error || 'รหัสนักศึกษาไม่ถูกต้อง');
      }
      const normalizedSid = idCheck.normalized;
      if (
        state.students.some(
          (s) =>
            (s.basicInfo.studentId || s.user.studentId || s.user.username).toLowerCase() ===
            normalizedSid.toLowerCase()
        )
      ) {
        throw new Error(`รหัสนักศึกษา ${normalizedSid} มีอยู่ในระบบแล้ว`);
      }

      const rawPwd = payload.password?.trim() || buildDefaultStudentPassword(normalizedSid);
      const passwordHash = await hashPasswordClient(rawPwd);
      const userId = `stu_${normalizedSid}`;
      const newUser: StoredUserRecord = {
        id: userId,
        role: 'student',
        username: normalizedSid.toLowerCase(),
        fullName,
        studentId: normalizedSid,
        authProvider: 'student_id',
        hasPassword: true,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        createdAt: now,
        passwordHash,
      };

      const basicInfo = createEmptyBasicInfo('', fullName, normalizedSid);
      state.studentAuthMap.set(userId, newUser);
      state.allUsersMap.set(userId, newUser);
      state.students.push({
        user: toUserAccount(newUser),
        basicInfo,
        application: null,
        grades: [],
        volunteers: [],
      });

      await syncTableToSheets('Students', extractAllStudentRowsForSync(state));
      return { user: toUserAccount(newUser) };
    }

    const username = String(payload.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new Error('ชื่อผู้ใช้งานต้องมี 3-40 ตัวอักษร (ภาษาอังกฤษ ตัวเลข . _ -)');
    }
    const existing = [...state.admins, ...state.users].some(
      (u) => u.username.toLowerCase() === username
    );
    if (existing) {
      throw new Error(`ชื่อผู้ใช้งาน "${username}" มีอยู่ในระบบแล้ว`);
    }

    const rawPwd = payload.password?.trim() || '';
    if (rawPwd.length < 8) {
      throw new Error('กรุณากำหนดรหัสผ่านอย่างน้อย 8 ตัวอักษร');
    }
    const passwordHash = await hashPasswordClient(rawPwd);
    const prefix = payload.role === 'admin' ? 'adm' : 'tch';
    const userId = `${prefix}_${username}_${Date.now().toString(36)}`;
    const newUser: StoredUserRecord = {
      id: userId,
      role: payload.role,
      username,
      fullName,
      authProvider: 'password',
      hasPassword: true,
      mustChangePassword: false,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      createdAt: now,
      passwordHash,
    };

    if (payload.role === 'admin') {
      state.admins.push(newUser);
      state.allUsersMap.set(userId, newUser);
      await syncTableToSheets('Admins', state.admins.map(serializeAdminOrUserRow));
    } else {
      state.users.push(newUser);
      state.allUsersMap.set(userId, newUser);
      await syncTableToSheets('Users', state.users.map(serializeAdminOrUserRow));
    }

    return { user: toUserAccount(newUser) };
  },

  async adminDeleteUser(userId: string): Promise<{ deletedUser: UserAccount }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    const target = findUserInState(state, userId);
    if (!target) {
      throw new Error('ไม่พบบัญชีผู้ใช้งาน');
    }

    const adminCount = state.admins.length + state.users.filter((u) => u.role === 'admin').length;
    const check = canDeleteUserAccount({
      actorRole: actor.role,
      actorUserId: actor.id,
      targetUserId: target.id,
      targetRole: target.role,
      adminCount,
    });
    if (!check.allowed) {
      throw new Error(check.reason || 'ไม่สามารถลบบัญชีนี้ได้');
    }

    const { syncTableToSheets } = await import('./googleSheetsDb');
    if (target.role === 'student') {
      state.students = state.students.filter((s) => s.user.id !== target.id);
      state.studentAuthMap.delete(target.id);
      state.allUsersMap.delete(target.id);
      await Promise.all([
        syncTableToSheets('Students', extractAllStudentRowsForSync(state)),
        syncTableToSheets('Applications', extractAllApplicationRowsForSync(state)),
        syncTableToSheets('Grades', extractAllGradeRowsForSync(state)),
        syncTableToSheets('VolunteerLogs', extractAllVolunteerRowsForSync(state)),
        syncTableToSheets('Scholarships', serializeScholarshipRows(state.students)),
      ]);
    } else if (target.role === 'admin') {
      state.admins = state.admins.filter((a) => a.id !== target.id);
      state.users = state.users.filter((u) => u.id !== target.id);
      state.allUsersMap.delete(target.id);
      await Promise.all([
        syncTableToSheets('Admins', state.admins.map(serializeAdminOrUserRow)),
        syncTableToSheets('Users', state.users.map(serializeAdminOrUserRow)),
      ]);
    } else {
      state.users = state.users.filter((u) => u.id !== target.id);
      state.allUsersMap.delete(target.id);
      await syncTableToSheets('Users', state.users.map(serializeAdminOrUserRow));
    }

    return { deletedUser: toUserAccount(target) };
  },

  async getWorkspaceConfig(): Promise<{ config: GoogleWorkspaceConfig }> {
    const state = await ensureState(false);
    return { config: state.workspaceConfig };
  },

  async saveWorkspaceConfig(
    config: GoogleWorkspaceConfig
  ): Promise<{ config: GoogleWorkspaceConfig }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin' && actor.role !== 'teacher') {
      throw new Error('ไม่มีสิทธิ์บันทึกการตั้งค่า');
    }

    const sanitized = sanitizeWorkspaceConfigInput({
      ...config,
      lastSyncedAt: new Date().toISOString(),
      lastSyncedBy: actor.fullName,
    });
    state.workspaceConfig = sanitized;

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await syncTableToSheets('Settings', serializeSettingsRows(sanitized));

    return { config: sanitized };
  },

  async syncAllTablesToSheets(): Promise<{
    students: number;
    applications: number;
    grades: number;
    volunteers: number;
    scholarships: number;
  }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin' && actor.role !== 'teacher') {
      throw new Error('ไม่มีสิทธิ์ซิงก์ฐานข้อมูล');
    }

    const updatedConfig: GoogleWorkspaceConfig = {
      ...state.workspaceConfig,
      lastSyncedAt: new Date().toISOString(),
      lastSyncedBy: actor.fullName,
    };
    state.workspaceConfig = updatedConfig;

    const studentRows = extractAllStudentRowsForSync(state);
    const appRows = extractAllApplicationRowsForSync(state);
    const gradeRows = extractAllGradeRowsForSync(state);
    const volRows = extractAllVolunteerRowsForSync(state);
    const scholarshipRows = serializeScholarshipRows(state.students);

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await Promise.all([
      syncTableToSheets('Admins', state.admins.map(serializeAdminOrUserRow)),
      syncTableToSheets('Users', state.users.map(serializeAdminOrUserRow)),
      syncTableToSheets('Students', studentRows),
      syncTableToSheets('Scholarships', scholarshipRows),
      syncTableToSheets('Applications', appRows),
      syncTableToSheets('Grades', gradeRows),
      syncTableToSheets('VolunteerLogs', volRows),
      syncTableToSheets('Settings', serializeSettingsRows(updatedConfig)),
    ]);

    return {
      students: studentRows.length,
      applications: appRows.length,
      grades: gradeRows.length,
      volunteers: volRows.length,
      scholarships: scholarshipRows.length,
    };
  },

  async restoreSnapshot(
    payload: SystemSnapshotPayload
  ): Promise<{ result: RestoreSnapshotResult }> {
    const state = await ensureState(false);
    const actor = requireCurrentUser(state);
    if (actor.role !== 'admin') {
      throw new Error('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถกู้คืนข้อมูลทั้งระบบได้');
    }

    if (!payload || !Array.isArray(payload.students)) {
      throw new Error('รูปแบบไฟล์สำรองข้อมูลไม่ถูกต้อง');
    }

    let restoredApplications = 0;
    let restoredGrades = 0;
    let restoredVolunteers = 0;

    const nextStudents: StudentFullRecord[] = [];
    for (const rec of payload.students) {
      if (!rec || !rec.user || !rec.basicInfo) continue;
      const sid = rec.basicInfo.studentId || rec.user.studentId || rec.user.username;
      const existingAuth = state.studentAuthMap.get(rec.user.id);
      const defaultPwd = buildDefaultStudentPassword(sid) || rec.user.username;
      const passwordHash =
        existingAuth?.passwordHash || (await hashPasswordClient(defaultPwd));

      const authRecord: StoredUserRecord = {
        ...rec.user,
        role: 'student',
        passwordHash,
      };
      state.studentAuthMap.set(rec.user.id, authRecord);
      state.allUsersMap.set(rec.user.id, authRecord);

      if (rec.application) restoredApplications += 1;
      restoredGrades += Array.isArray(rec.grades) ? rec.grades.length : 0;
      restoredVolunteers += Array.isArray(rec.volunteers) ? rec.volunteers.length : 0;

      nextStudents.push({
        user: toUserAccount(authRecord),
        basicInfo: rec.basicInfo,
        application: rec.application || null,
        grades: Array.isArray(rec.grades) ? rec.grades : [],
        volunteers: Array.isArray(rec.volunteers) ? rec.volunteers : [],
      });
    }

    state.students = nextStudents;

    let workspaceRestored = false;
    if (payload.workspaceConfig) {
      state.workspaceConfig = sanitizeWorkspaceConfigInput({
        ...payload.workspaceConfig,
        lastSyncedAt: new Date().toISOString(),
        lastSyncedBy: actor.fullName,
      });
      workspaceRestored = true;
    }

    const { syncTableToSheets } = await import('./googleSheetsDb');
    await Promise.all([
      syncTableToSheets('Students', extractAllStudentRowsForSync(state)),
      syncTableToSheets('Scholarships', serializeScholarshipRows(state.students)),
      syncTableToSheets('Applications', extractAllApplicationRowsForSync(state)),
      syncTableToSheets('Grades', extractAllGradeRowsForSync(state)),
      syncTableToSheets('VolunteerLogs', extractAllVolunteerRowsForSync(state)),
      syncTableToSheets('Settings', serializeSettingsRows(state.workspaceConfig)),
    ]);

    return {
      result: {
        restoredStudents: nextStudents.length,
        restoredApplications,
        restoredGrades,
        restoredVolunteers,
        workspaceRestored,
      },
    };
  },
};

export function exportStudentsToExcel(
  records: StudentFullRecord[],
  fileNamePrefix = 'cmru_scholarships'
) {
  const rows = records.map((rec, idx) => {
    const volSummary = calculateApprovedVolunteerHours(rec.volunteers);
    const statusMeta = getApplicationStatusMeta(rec.application?.status);
    return {
      'ลำดับ': idx + 1,
      'รหัสนักศึกษา': rec.basicInfo.studentId || rec.user.studentId || '-',
      'ชื่อ-นามสกุล': rec.basicInfo.fullName || rec.user.fullName,
      'อีเมล': rec.user.email || rec.user.username,
      'ปีการศึกษา': rec.application?.academicYear || rec.basicInfo.academicYear,
      'ชั้นปี': rec.application?.yearLevel || rec.basicInfo.yearLevel,
      'GPAX': rec.application?.gpax || rec.basicInfo.gpax || '-',
      'กยศ.': rec.basicInfo.hasStudentLoan || '-',
      'ทุนการศึกษาที่ได้รับ':
        rec.basicInfo.hasOtherScholarship === 'ได้รับทุน'
          ? formatReceivedScholarshipsText(rec.basicInfo) || 'ได้รับทุน'
          : 'ไม่ได้รับทุน',
      'รายได้บิดา(บาท/เดือน)': rec.basicInfo.father.monthlyIncome || '0',
      'รายได้มารดา(บาท/เดือน)': rec.basicInfo.mother.monthlyIncome || '0',
      'สถานะทุนการศึกษา': statusMeta.label,
      'ชั่วโมงจิตอาสา(อนุมัติแล้ว)': volSummary.approvedHours,
      'ความคิดเห็นอาจารย์': rec.application?.advisorComment || '-',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'รายชื่อขอทุนการศึกษา');
  XLSX.writeFile(workbook, `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportStudentsToCsv(
  records: StudentFullRecord[],
  fileNamePrefix = 'cmru_google_sheets'
) {
  const headers = [
    'ลำดับ',
    'รหัสนักศึกษา',
    'ชื่อ-นามสกุล',
    'อีเมล',
    'ปีการศึกษา',
    'ชั้นปี',
    'GPAX',
    'กยศ.',
    'ทุนการศึกษาที่ได้รับ',
    'สถานะทุนการศึกษา',
    'ชั่วโมงจิตอาสาที่อนุมัติ',
    'ความคิดเห็นอาจารย์',
  ];

  const lines = [headers.join(',')];
  records.forEach((rec, idx) => {
    const volSummary = calculateApprovedVolunteerHours(rec.volunteers);
    const statusMeta = getApplicationStatusMeta(rec.application?.status);
    const cols = [
      String(idx + 1),
      rec.basicInfo.studentId || rec.user.studentId || '-',
      rec.basicInfo.fullName || rec.user.fullName,
      rec.user.email || rec.user.username,
      rec.application?.academicYear || rec.basicInfo.academicYear,
      rec.application?.yearLevel || rec.basicInfo.yearLevel,
      rec.application?.gpax || rec.basicInfo.gpax || '-',
      rec.basicInfo.hasStudentLoan || '-',
      rec.basicInfo.hasOtherScholarship === 'ได้รับทุน'
        ? formatReceivedScholarshipsText(rec.basicInfo) || 'ได้รับทุน'
        : 'ไม่ได้รับทุน',
      statusMeta.label,
      String(volSummary.approvedHours),
      rec.application?.advisorComment || '-',
    ].map((cell) => sanitizeCsvCell(cell));
    lines.push(cols.join(','));
  });

  const blob = new Blob(['\uFEFF' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadStudentImportTemplateExcel() {
  const sampleRows = [
    {
      'รหัสนักศึกษา': '69000001',
      'ชื่อ-นามสกุล': 'นางสาวตัวอย่าง ใจดี',
      'อีเมล (ไม่บังคับ)': '',
      'ปีการศึกษา': '2569',
      'ชั้นปี': 'ปี 1',
      'GPAX': '3.50',
      'เบอร์โทรศัพท์': '08x-xxx-xxxx',
      'กยศ. (กู้/ไม่กู้)': 'กู้',
      'รหัสผ่านเริ่มต้น (เว้นว่างใช้รหัสนักศึกษา)': '',
    },
  ];
  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'รายชื่อนักศึกษา');
  XLSX.writeFile(workbook, 'template_import_students_cmru.xlsx');
}
