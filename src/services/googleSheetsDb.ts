import type {
  AcademicYear,
  BasicInfoData,
  GoogleSheetTableName,
  GoogleSheetsDatabasePayload,
  GoogleWorkspaceConfig,
  GradeRecord,
  ScholarshipApplicationData,
  SemesterType,
  SheetRecordRow,
  StudentFullRecord,
  UploadedFileMeta,
  UserAccount,
  UserRole,
  VolunteerRecord,
  YearLevel,
} from '../types/scholarship';
import {
  buildDefaultStudentPassword,
  createEmptyBasicInfo,
  extractConfirmedReceivedScholarships,
  normalizeExcelAcademicYear,
  normalizeExcelLoanStatus,
  normalizeExcelYearLevel,
} from '../utils/scholarshipLogic';
import { sanitizeWorkspaceConfigInput } from '../utils/securityGuard';

export const DB_API_URL =
  'https://script.google.com/macros/s/AKfycbyzJDE-dsfultjzy7lnB3gu9YX0AqtVaYYkUh6HqzQqzJiX4CpAOkjipfYAEB8WYMBz/exec';

export const MAX_DRIVE_UPLOAD_BYTES = 3 * 1024 * 1024; // 3 MB
export const CURRENT_USER_SESSION_KEY = 'currentUser';

export interface StoredUserRecord extends UserAccount {
  passwordHash?: string;
  plainPasswordFallback?: string;
}

export interface HydratedDatabaseState {
  admins: StoredUserRecord[];
  users: StoredUserRecord[];
  students: StudentFullRecord[];
  studentAuthMap: Map<string, StoredUserRecord>;
  allUsersMap: Map<string, StoredUserRecord>;
  workspaceConfig: GoogleWorkspaceConfig;
  rawDatabase: GoogleSheetsDatabasePayload;
  loadedAt: string;
}

function getSubtleCrypto(): SubtleCrypto | null {
  const cryptoObj = globalThis.crypto;
  return cryptoObj && cryptoObj.subtle ? cryptoObj.subtle : null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function hashPasswordClient(password: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const saltBytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(saltBytes);
  } else {
    for (let i = 0; i < saltBytes.length; i += 1) {
      saltBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const saltHex = bytesToHex(saltBytes);

  if (!subtle) {
    throw new Error('เบราว์เซอร์ไม่รองรับ Web Crypto สำหรับเข้ารหัสรหัสผ่าน');
  }

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const hashHex = bytesToHex(new Uint8Array(derivedBits));
  return `pbkdf2$${saltHex}$${hashHex}`;
}

export async function verifyPasswordClient(
  password: string,
  storedHash?: string,
  plainFallback?: string
): Promise<boolean> {
  if (storedHash && storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, saltHex, expectedHex] = parts;
    const subtle = getSubtleCrypto();
    if (!subtle || !saltHex || !expectedHex) return false;
    try {
      const keyMaterial = await subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const saltBytes = hexToBytes(saltHex);
      const derivedBits = await subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes.buffer as ArrayBuffer,
          iterations: 100_000,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );
      const actualHex = bytesToHex(new Uint8Array(derivedBits));
      return constantTimeEqual(actualHex, expectedHex);
    } catch {
      return false;
    }
  }

  if (storedHash && storedHash.length > 0 && !storedHash.startsWith('pbkdf2$')) {
    return password === storedHash;
  }

  if (plainFallback !== undefined && plainFallback !== '') {
    return password === plainFallback;
  }

  return false;
}

export function stripBase64DataUrlPrefix(dataUrlOrBase64: string): string {
  const raw = String(dataUrlOrBase64 || '').trim();
  const commaIdx = raw.indexOf(',');
  if (raw.startsWith('data:') && commaIdx !== -1) {
    return raw.slice(commaIdx + 1);
  }
  return raw;
}

export function extractGoogleDriveFileId(url: string): string | undefined {
  const trimmed = String(url || '').trim();
  if (!trimmed) return undefined;
  const pathMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (pathMatch?.[1]) return pathMatch[1];
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (dMatch?.[1]) return dMatch[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryMatch?.[1]) return queryMatch[1];
  return undefined;
}

export function buildDriveImagePreviewUrl(src: string, driveFileId?: string): string {
  const id = driveFileId || extractGoogleDriveFileId(src);
  if (id) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`;
  }
  return src;
}

export function getSessionCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.sessionStorage.getItem(CURRENT_USER_SESSION_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function setSessionCurrentUserId(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId && userId.trim()) {
      window.sessionStorage.setItem(CURRENT_USER_SESSION_KEY, userId.trim());
    } else {
      window.sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
    }
  } catch {
    // Ignore sessionStorage restrictions
  }
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function asBool(val: unknown, defaultVal = false): boolean {
  if (typeof val === 'boolean') return val;
  const str = String(val ?? '').trim().toLowerCase();
  if (str === 'true' || str === '1' || str === 'yes') return true;
  if (str === 'false' || str === '0' || str === 'no') return false;
  return defaultVal;
}

function asNumber(val: unknown, defaultVal = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : defaultVal;
}

function buildFileMetaFromUrl(url: string, fallbackName = 'uploaded-file'): UploadedFileMeta {
  const trimmed = url.trim();
  const driveFileId = extractGoogleDriveFileId(trimmed);
  return {
    id: `drv_${driveFileId || Math.random().toString(36).slice(2, 10)}`,
    name: fallbackName,
    size: 0,
    mimeType: trimmed.toLowerCase().includes('.pdf') ? 'application/pdf' : 'image/jpeg',
    url: trimmed,
    uploadedAt: new Date().toISOString(),
    storageProvider: 'google_drive',
    ...(driveFileId ? { driveFileId } : {}),
    driveWebViewLink: trimmed,
  };
}

function parseUrlListToMeta(rawUrls: unknown, labelPrefix: string): UploadedFileMeta[] {
  const raw = String(rawUrls ?? '').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    const parsed = safeParseJson<unknown[]>(raw, []);
    return parsed
      .map((item, idx) => {
        if (typeof item === 'string' && item.trim()) {
          return buildFileMetaFromUrl(item, `${labelPrefix}-${idx + 1}`);
        }
        if (item && typeof item === 'object' && 'url' in item) {
          return item as UploadedFileMeta;
        }
        return null;
      })
      .filter((x): x is UploadedFileMeta => Boolean(x));
  }
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((u, idx) => buildFileMetaFromUrl(u, `${labelPrefix}-${idx + 1}`));
}

export function formatFileUrlsColumn(files: UploadedFileMeta[] | null | undefined): string {
  if (!Array.isArray(files) || files.length === 0) return '';
  return files
    .map((f) => f.driveWebViewLink || f.url)
    .filter(Boolean)
    .join(', ');
}

function toPublicUserAccount(u: StoredUserRecord): UserAccount {
  return {
    id: u.id,
    role: u.role,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    studentId: u.studentId,
    authProvider: u.authProvider,
    hasPassword: Boolean(u.hasPassword || u.passwordHash),
    mustChangePassword: Boolean(u.mustChangePassword),
    passwordChangedAt: u.passwordChangedAt,
    failedLoginAttempts: u.failedLoginAttempts ?? 0,
    lockedUntil: u.lockedUntil,
    createdAt: u.createdAt,
  };
}

function parseUserRow(
  row: SheetRecordRow,
  defaultRole: UserRole
): StoredUserRecord | null {
  const studentIdRaw = String(row.studentId ?? '').trim();
  const usernameRaw = String(row.username ?? studentIdRaw ?? row.email ?? '').trim().toLowerCase();
  if (!usernameRaw && !studentIdRaw) return null;

  const roleRaw = String(row.role ?? defaultRole).trim().toLowerCase();
  const role: UserRole =
    roleRaw === 'admin' || roleRaw === 'teacher' || roleRaw === 'student'
      ? roleRaw
      : defaultRole;

  const id =
    String(row.id ?? '').trim() ||
    (role === 'student' && studentIdRaw
      ? `stu_${studentIdRaw}`
      : `${role}_${usernameRaw}`);

  const fullName = String(row.fullName ?? row.name ?? usernameRaw).trim() || usernameRaw;
  const email = String(row.email ?? '').trim() || undefined;
  const passwordHash = String(row.passwordHash ?? '').trim() || undefined;
  const rawPlain = String(row.password ?? '').trim();
  const defaultStuPw = role === 'student' ? buildDefaultStudentPassword(studentIdRaw || usernameRaw) : '';
  const plainFallback = rawPlain || (!passwordHash && defaultStuPw ? defaultStuPw : undefined);

  return {
    id,
    role,
    username: usernameRaw || studentIdRaw.toLowerCase(),
    email,
    fullName,
    studentId: studentIdRaw || (role === 'student' ? usernameRaw : undefined),
    authProvider:
      (String(row.authProvider ?? '').trim() as UserAccount['authProvider']) ||
      (role === 'student' ? 'student_id' : 'password'),
    hasPassword: asBool(row.hasPassword, Boolean(passwordHash || plainFallback)),
    mustChangePassword: asBool(row.mustChangePassword, false),
    passwordChangedAt: String(row.passwordChangedAt ?? '').trim() || undefined,
    failedLoginAttempts: asNumber(row.failedLoginAttempts, 0),
    lockedUntil: String(row.lockedUntil ?? '').trim() || undefined,
    createdAt: String(row.createdAt ?? '').trim() || new Date().toISOString(),
    passwordHash,
    plainPasswordFallback: plainFallback,
  };
}

export function serializeAdminOrUserRow(u: StoredUserRecord): SheetRecordRow {
  return {
    id: u.id,
    role: u.role,
    username: u.username,
    email: u.email || '',
    fullName: u.fullName,
    studentId: u.studentId || '',
    authProvider: u.authProvider,
    passwordHash: u.passwordHash || '',
    hasPassword: Boolean(u.hasPassword || u.passwordHash),
    mustChangePassword: Boolean(u.mustChangePassword),
    passwordChangedAt: u.passwordChangedAt || '',
    failedLoginAttempts: u.failedLoginAttempts ?? 0,
    lockedUntil: u.lockedUntil || '',
    createdAt: u.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export function serializeStudentRow(
  studentUser: StoredUserRecord,
  basicInfo: BasicInfoData
): SheetRecordRow {
  return {
    id: studentUser.id,
    role: 'student',
    studentId: basicInfo.studentId || studentUser.studentId || studentUser.username,
    username: studentUser.username,
    fullName: basicInfo.fullName || studentUser.fullName,
    email: basicInfo.email || studentUser.email || '',
    academicYear: basicInfo.academicYear || '2569',
    yearLevel: basicInfo.yearLevel || 'ปี 1',
    gpax: basicInfo.gpax || '',
    phone: basicInfo.phone || '',
    hasStudentLoan: basicInfo.hasStudentLoan || 'ไม่กู้',
    pdpaConsented: Boolean(basicInfo.pdpaConsented),
    profilePhotoUrl: basicInfo.profilePhoto?.driveWebViewLink || basicInfo.profilePhoto?.url || '',
    housePhotoUrls: formatFileUrlsColumn(basicInfo.housePhotos),
    authProvider: studentUser.authProvider || 'student_id',
    passwordHash: studentUser.passwordHash || '',
    hasPassword: Boolean(studentUser.hasPassword || studentUser.passwordHash),
    mustChangePassword: Boolean(studentUser.mustChangePassword),
    passwordChangedAt: studentUser.passwordChangedAt || '',
    failedLoginAttempts: studentUser.failedLoginAttempts ?? 0,
    lockedUntil: studentUser.lockedUntil || '',
    createdAt: studentUser.createdAt,
    updatedAt: new Date().toISOString(),
    basicInfoJson: JSON.stringify(basicInfo),
  };
}

export function serializeApplicationRow(app: ScholarshipApplicationData): SheetRecordRow {
  return {
    id: app.id,
    studentUserId: app.studentUserId,
    studentId: app.studentId,
    fullName: app.fullName,
    academicYear: app.academicYear,
    yearLevel: app.yearLevel,
    gpax: app.gpax,
    status: app.status,
    advisorComment: app.advisorComment || '',
    reviewedBy: app.reviewedBy || '',
    reviewedAt: app.reviewedAt || '',
    submittedAt: app.submittedAt || '',
    indoorHousePhotoUrls: formatFileUrlsColumn(app.indoorHousePhotos),
    indoorFamilyPhotoUrls: formatFileUrlsColumn(app.indoorFamilyPhotos),
    outdoorHousePhotoUrls: formatFileUrlsColumn(app.outdoorHousePhotos),
    outdoorFamilyPhotoUrls: formatFileUrlsColumn(app.outdoorFamilyPhotos),
    updatedAt: app.updatedAt || new Date().toISOString(),
    applicationJson: JSON.stringify(app),
  };
}

export function serializeGradeRow(grade: GradeRecord): SheetRecordRow {
  return {
    id: grade.id,
    studentUserId: grade.studentUserId,
    studentId: grade.studentId,
    studentName: grade.studentName,
    academicYear: grade.academicYear,
    yearLevel: grade.yearLevel,
    semester: grade.semester,
    gpa: grade.gpa,
    attachmentUrls: formatFileUrlsColumn(grade.attachments),
    uploadedByRole: grade.uploadedByRole,
    uploadedByName: grade.uploadedByName,
    createdAt: grade.createdAt,
    updatedAt: grade.updatedAt,
    attachmentsJson: JSON.stringify(grade.attachments || []),
  };
}

export function serializeVolunteerRow(vol: VolunteerRecord): SheetRecordRow {
  return {
    id: vol.id,
    studentUserId: vol.studentUserId,
    studentId: vol.studentId,
    studentName: vol.studentName,
    academicYear: vol.academicYear,
    activityTitle: vol.activityTitle,
    activityDetail: vol.activityDetail,
    learnings: vol.learnings,
    hours: vol.hours,
    activityDate: vol.activityDate,
    dailyLifeApplication: vol.dailyLifeApplication,
    photoUrls: formatFileUrlsColumn(vol.photos),
    approvalStatus: vol.approvalStatus,
    approvedHours: vol.approvedHours,
    advisorNote: vol.advisorNote || '',
    reviewedBy: vol.reviewedBy || '',
    reviewedAt: vol.reviewedAt || '',
    createdAt: vol.createdAt,
    photosJson: JSON.stringify(vol.photos || []),
  };
}

export function serializeScholarshipRows(students: StudentFullRecord[]): SheetRecordRow[] {
  const rows: SheetRecordRow[] = [];
  for (const rec of students) {
    const items = extractConfirmedReceivedScholarships(rec.basicInfo);
    for (const item of items) {
      rows.push({
        id: `${rec.user.id}_${item.id}`,
        studentUserId: rec.user.id,
        studentId: rec.basicInfo.studentId || rec.user.studentId || '',
        fullName: rec.basicInfo.fullName || rec.user.fullName || '',
        academicYear: rec.application?.academicYear || rec.basicInfo.academicYear || '2569',
        yearLevel: rec.application?.yearLevel || rec.basicInfo.yearLevel || 'ปี 1',
        scholarshipName: item.name,
        provider: item.provider || '',
        updatedAt: rec.basicInfo.savedAt || new Date().toISOString(),
      });
    }
  }
  return rows;
}

export function serializeSettingsRows(config: GoogleWorkspaceConfig): SheetRecordRow[] {
  const sanitized = sanitizeWorkspaceConfigInput(config as Record<string, unknown>);
  return [
    {
      key: 'workspaceConfig',
      spreadsheetId: sanitized.spreadsheetId || '',
      spreadsheetTitle: sanitized.spreadsheetTitle || '',
      spreadsheetUrl: sanitized.spreadsheetUrl || '',
      driveFolderId: sanitized.driveFolderId || '',
      driveFolderName: sanitized.driveFolderName || '',
      driveFolderUrl: sanitized.driveFolderUrl || '',
      lastSyncedAt: sanitized.lastSyncedAt || new Date().toISOString(),
      lastSyncedBy: sanitized.lastSyncedBy || '',
      value: JSON.stringify(sanitized),
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function hydrateDatabasePayload(
  rawDb: Partial<GoogleSheetsDatabasePayload> | undefined | null
): HydratedDatabaseState {
  const db: GoogleSheetsDatabasePayload = {
    Admins: Array.isArray(rawDb?.Admins) ? rawDb!.Admins : [],
    Users: Array.isArray(rawDb?.Users) ? rawDb!.Users : [],
    Students: Array.isArray(rawDb?.Students) ? rawDb!.Students : [],
    Scholarships: Array.isArray(rawDb?.Scholarships) ? rawDb!.Scholarships : [],
    Applications: Array.isArray(rawDb?.Applications) ? rawDb!.Applications : [],
    VolunteerLogs: Array.isArray(rawDb?.VolunteerLogs) ? rawDb!.VolunteerLogs : [],
    Grades: Array.isArray(rawDb?.Grades) ? rawDb!.Grades : [],
    Settings: Array.isArray(rawDb?.Settings) ? rawDb!.Settings : [],
  };

  const admins: StoredUserRecord[] = [];
  const users: StoredUserRecord[] = [];
  const allUsersMap = new Map<string, StoredUserRecord>();
  const studentAuthMap = new Map<string, StoredUserRecord>();

  for (const row of db.Admins) {
    const parsed = parseUserRow(row, 'admin');
    if (parsed) {
      admins.push(parsed);
      allUsersMap.set(parsed.id, parsed);
    }
  }

  for (const row of db.Users) {
    const parsed = parseUserRow(row, 'teacher');
    if (!parsed) continue;
    users.push(parsed);
    if (!allUsersMap.has(parsed.id)) {
      allUsersMap.set(parsed.id, parsed);
    }
  }

  // Build applications, grades, volunteers lookup maps indexed by studentUserId and studentId
  const applicationsByUserId = new Map<string, ScholarshipApplicationData>();
  const applicationsByStudentId = new Map<string, ScholarshipApplicationData>();
  for (const row of db.Applications) {
    const parsedApp = safeParseJson<ScholarshipApplicationData | null>(row.applicationJson, null);
    if (parsedApp && parsedApp.studentUserId) {
      applicationsByUserId.set(parsedApp.studentUserId, parsedApp);
      if (parsedApp.studentId) {
        applicationsByStudentId.set(parsedApp.studentId, parsedApp);
      }
      continue;
    }
    const studentUserId = String(row.studentUserId ?? '').trim();
    const studentId = String(row.studentId ?? '').trim();
    if (!studentUserId && !studentId) continue;
    const fallbackApp: ScholarshipApplicationData = {
      id: String(row.id ?? `app_${studentUserId || studentId}`),
      studentUserId: studentUserId || `stu_${studentId}`,
      academicYear: normalizeExcelAcademicYear(row.academicYear),
      yearLevel: normalizeExcelYearLevel(row.yearLevel),
      fullName: String(row.fullName ?? ''),
      studentId,
      yearAndSection: '',
      gpax: String(row.gpax ?? ''),
      birthDate: '',
      age: '',
      nationality: 'ไทย',
      ethnicity: 'ไทย',
      religion: 'พุทธ',
      phone: '',
      facebook: '',
      registeredAddress: {
        houseNo: '',
        alleyRoad: '',
        subDistrict: '',
        district: '',
        province: 'เชียงใหม่',
        postalCode: '',
      },
      currentAddress: {
        houseNo: '',
        alleyRoad: '',
        subDistrict: '',
        district: '',
        province: 'เชียงใหม่',
        postalCode: '',
      },
      financialSponsorName: '',
      financialSponsorRelation: 'บิดา',
      financialSponsorRelationOther: '',
      monthlyExpenses: '',
      hasChronicDisease: 'ไม่มี',
      chronicDiseaseDetail: '',
      hasStudentLoan: 'ไม่กู้ กยศ.',
      hasOtherScholarship: 'ไม่ได้รับ',
      otherScholarshipNameAmount: '',
      hasPartTimeJob: 'ไม่ได้ทำงาน',
      partTimeJobDetailIncome: '',
      father: {
        fullName: '',
        status: '',
        age: '',
        occupation: '',
        workplace: '',
        monthlyIncome: '',
        phone: '',
      },
      mother: {
        fullName: '',
        status: '',
        age: '',
        occupation: '',
        workplace: '',
        monthlyIncome: '',
        phone: '',
      },
      parentsMaritalStatus: 'อยู่ด้วยกัน',
      parentsMaritalStatusOther: '',
      guardian: {
        fullName: '',
        status: '',
        age: '',
        occupation: '',
        workplace: '',
        monthlyIncome: '',
        phone: '',
        relationship: '',
      },
      householdMembersCount: '',
      housingStatus: 'บ้านของตนเอง',
      housingStatusOther: '',
      currentlyLivingWith: '',
      financialProblemDetail: '',
      scholarshipNecessityDetail: '',
      expectedBenefitDetail: '',
      indoorHousePhotos: parseUrlListToMeta(row.indoorHousePhotoUrls, 'indoor-house'),
      indoorFamilyPhotos: parseUrlListToMeta(row.indoorFamilyPhotoUrls, 'indoor-family'),
      outdoorHousePhotos: parseUrlListToMeta(row.outdoorHousePhotoUrls, 'outdoor-house'),
      outdoorFamilyPhotos: parseUrlListToMeta(row.outdoorFamilyPhotoUrls, 'outdoor-family'),
      status: (String(row.status ?? 'draft').trim() as ScholarshipApplicationData['status']) || 'draft',
      advisorComment: String(row.advisorComment ?? ''),
      reviewedBy: String(row.reviewedBy ?? '') || undefined,
      reviewedAt: String(row.reviewedAt ?? '') || undefined,
      submittedAt: String(row.submittedAt ?? '') || undefined,
      updatedAt: String(row.updatedAt ?? '') || new Date().toISOString(),
    };
    applicationsByUserId.set(fallbackApp.studentUserId, fallbackApp);
    if (studentId) applicationsByStudentId.set(studentId, fallbackApp);
  }

  const gradesByUserId = new Map<string, GradeRecord[]>();
  const gradesByStudentId = new Map<string, GradeRecord[]>();
  for (const row of db.Grades) {
    const attachments = safeParseJson<UploadedFileMeta[]>(
      row.attachmentsJson,
      parseUrlListToMeta(row.attachmentUrls, 'grade')
    );
    const grade: GradeRecord = {
      id: String(row.id ?? `grd_${Math.random().toString(36).slice(2, 10)}`),
      studentUserId: String(row.studentUserId ?? '').trim(),
      studentId: String(row.studentId ?? '').trim(),
      studentName: String(row.studentName ?? '').trim(),
      academicYear: normalizeExcelAcademicYear(row.academicYear),
      yearLevel: normalizeExcelYearLevel(row.yearLevel),
      semester:
        row.semester === 'ภาคเรียนที่ 2' ? 'ภาคเรียนที่ 2' : ('ภาคเรียนที่ 1' as SemesterType),
      gpa: String(row.gpa ?? '').trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      uploadedByRole:
        (String(row.uploadedByRole ?? 'student').trim() as UserRole) || 'student',
      uploadedByName: String(row.uploadedByName ?? '').trim(),
      createdAt: String(row.createdAt ?? '').trim() || new Date().toISOString(),
      updatedAt: String(row.updatedAt ?? '').trim() || new Date().toISOString(),
    };
    if (grade.studentUserId) {
      const list = gradesByUserId.get(grade.studentUserId) || [];
      list.push(grade);
      gradesByUserId.set(grade.studentUserId, list);
    }
    if (grade.studentId) {
      const list = gradesByStudentId.get(grade.studentId) || [];
      list.push(grade);
      gradesByStudentId.set(grade.studentId, list);
    }
  }

  const volunteersByUserId = new Map<string, VolunteerRecord[]>();
  const volunteersByStudentId = new Map<string, VolunteerRecord[]>();
  for (const row of db.VolunteerLogs) {
    const photos = safeParseJson<UploadedFileMeta[]>(
      row.photosJson,
      parseUrlListToMeta(row.photoUrls, 'volunteer')
    );
    const statusRaw = String(row.approvalStatus ?? 'pending').trim();
    const approvalStatus: VolunteerRecord['approvalStatus'] =
      statusRaw === 'approved' || statusRaw === 'rejected' ? statusRaw : 'pending';
    const vol: VolunteerRecord = {
      id: String(row.id ?? `vol_${Math.random().toString(36).slice(2, 10)}`),
      studentUserId: String(row.studentUserId ?? '').trim(),
      studentId: String(row.studentId ?? '').trim(),
      studentName: String(row.studentName ?? '').trim(),
      academicYear: normalizeExcelAcademicYear(row.academicYear),
      activityTitle: String(row.activityTitle ?? '').trim(),
      activityDetail: String(row.activityDetail ?? '').trim(),
      learnings: String(row.learnings ?? '').trim(),
      hours: asNumber(row.hours, 0),
      activityDate: String(row.activityDate ?? '').trim(),
      dailyLifeApplication: String(row.dailyLifeApplication ?? '').trim(),
      photos: Array.isArray(photos) ? photos : [],
      approvalStatus,
      approvedHours: asNumber(row.approvedHours, 0),
      advisorNote: String(row.advisorNote ?? '').trim(),
      reviewedBy: String(row.reviewedBy ?? '').trim() || undefined,
      reviewedAt: String(row.reviewedAt ?? '').trim() || undefined,
      createdAt: String(row.createdAt ?? '').trim() || new Date().toISOString(),
    };
    if (vol.studentUserId) {
      const list = volunteersByUserId.get(vol.studentUserId) || [];
      list.push(vol);
      volunteersByUserId.set(vol.studentUserId, list);
    }
    if (vol.studentId) {
      const list = volunteersByStudentId.get(vol.studentId) || [];
      list.push(vol);
      volunteersByStudentId.set(vol.studentId, list);
    }
  }

  const students: StudentFullRecord[] = [];
  const seenStudentUserIds = new Set<string>();

  for (const row of db.Students) {
    const parsedUser = parseUserRow(row, 'student');
    if (!parsedUser) continue;
    if (seenStudentUserIds.has(parsedUser.id)) continue;
    seenStudentUserIds.add(parsedUser.id);

    studentAuthMap.set(parsedUser.id, parsedUser);
    allUsersMap.set(parsedUser.id, parsedUser);

    const parsedBasic = safeParseJson<Partial<BasicInfoData> | null>(row.basicInfoJson, null);
    const baseEmpty = createEmptyBasicInfo(
      parsedUser.email || '',
      parsedUser.fullName,
      parsedUser.studentId || parsedUser.username
    );

    const profilePhotoUrl = String(row.profilePhotoUrl ?? '').trim();
    const housePhotoUrls = String(row.housePhotoUrls ?? '').trim();

    const basicInfo: BasicInfoData = {
      ...baseEmpty,
      ...(parsedBasic || {}),
      studentId:
        parsedBasic?.studentId ||
        String(row.studentId ?? parsedUser.studentId ?? parsedUser.username).trim(),
      fullName: parsedBasic?.fullName || String(row.fullName ?? parsedUser.fullName).trim(),
      email: parsedBasic?.email ?? (parsedUser.email || ''),
      academicYear: (parsedBasic?.academicYear ||
        normalizeExcelAcademicYear(row.academicYear)) as AcademicYear,
      yearLevel: (parsedBasic?.yearLevel ||
        normalizeExcelYearLevel(row.yearLevel)) as YearLevel,
      gpax: parsedBasic?.gpax ?? String(row.gpax ?? '').trim(),
      phone: parsedBasic?.phone ?? String(row.phone ?? '').trim(),
      hasStudentLoan:
        parsedBasic?.hasStudentLoan ||
        (row.hasStudentLoan ? normalizeExcelLoanStatus(row.hasStudentLoan) : 'ไม่กู้'),
      pdpaConsented:
        parsedBasic?.pdpaConsented !== undefined
          ? Boolean(parsedBasic.pdpaConsented)
          : asBool(row.pdpaConsented, false),
      profilePhoto:
        parsedBasic?.profilePhoto ||
        (profilePhotoUrl ? buildFileMetaFromUrl(profilePhotoUrl, 'profile-photo') : null),
      housePhotos:
        Array.isArray(parsedBasic?.housePhotos) && parsedBasic!.housePhotos.length > 0
          ? parsedBasic!.housePhotos
          : parseUrlListToMeta(housePhotoUrls, 'house-photo'),
      supportingDocs: Array.isArray(parsedBasic?.supportingDocs) ? parsedBasic!.supportingDocs : [],
      documentNote: parsedBasic?.documentNote ?? '',
    };

    const sid = basicInfo.studentId || parsedUser.studentId || '';
    const application =
      applicationsByUserId.get(parsedUser.id) ||
      (sid ? applicationsByStudentId.get(sid) : undefined) ||
      null;

    const userGrades = gradesByUserId.get(parsedUser.id) || [];
    const sidGrades = sid ? gradesByStudentId.get(sid) || [] : [];
    const gradeMap = new Map<string, GradeRecord>();
    for (const g of [...userGrades, ...sidGrades]) {
      gradeMap.set(g.id, g);
    }

    const userVols = volunteersByUserId.get(parsedUser.id) || [];
    const sidVols = sid ? volunteersByStudentId.get(sid) || [] : [];
    const volMap = new Map<string, VolunteerRecord>();
    for (const v of [...userVols, ...sidVols]) {
      volMap.set(v.id, v);
    }

    students.push({
      user: toPublicUserAccount(parsedUser),
      basicInfo,
      application,
      grades: Array.from(gradeMap.values()),
      volunteers: Array.from(volMap.values()),
    });
  }

  let workspaceConfig: GoogleWorkspaceConfig = {};
  for (const row of db.Settings) {
    if (String(row.key ?? '').trim() === 'workspaceConfig' || db.Settings.length === 1) {
      const parsedCfg = safeParseJson<Record<string, unknown>>(row.value, {});
      workspaceConfig = sanitizeWorkspaceConfigInput({
        spreadsheetId: row.spreadsheetId,
        spreadsheetTitle: row.spreadsheetTitle,
        spreadsheetUrl: row.spreadsheetUrl,
        driveFolderId: row.driveFolderId,
        driveFolderName: row.driveFolderName,
        driveFolderUrl: row.driveFolderUrl,
        lastSyncedAt: row.lastSyncedAt,
        lastSyncedBy: row.lastSyncedBy,
        ...parsedCfg,
      });
      break;
    }
  }

  return {
    admins,
    users,
    students,
    studentAuthMap,
    allUsersMap,
    workspaceConfig,
    rawDatabase: db,
    loadedAt: new Date().toISOString(),
  };
}

let cachedState: HydratedDatabaseState | null = null;
let inflightLoadPromise: Promise<HydratedDatabaseState> | null = null;

export function getCachedDatabaseState(): HydratedDatabaseState | null {
  return cachedState;
}

export function clearCachedDatabaseState(): void {
  cachedState = null;
}

async function fetchAppsScriptGet(url: string, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`ไม่สามารถโหลดข้อมูลจาก Google Sheets ได้ (HTTP ${res.status})`);
    }
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error('ข้อมูลที่ได้รับจาก Google Sheets API ไม่ใช่ JSON ที่ถูกต้อง');
    }
    if (data.status === 'error' || data.ok === false || data.error) {
      throw new Error(String(data.message || data.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล'));
    }
    return data;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('การโหลดข้อมูลจาก Google Sheets ใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAppsScriptPost(
  payload: Record<string, unknown>,
  timeoutMs = 45_000
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // IMPORTANT: Omit Content-Type header intentionally to prevent CORS preflight against Google Apps Script
    const res = await fetch(DB_API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`ไม่สามารถบันทึกข้อมูลไปยัง Google Sheets/Drive ได้ (HTTP ${res.status})`);
    }
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error('การตอบกลับจาก Google Apps Script ไม่ถูกต้อง');
    }
    if (data.status === 'error' || data.ok === false || data.error) {
      throw new Error(String(data.message || data.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'));
    }
    return data;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('การบันทึกข้อมูลไปยัง Google Sheets/Drive ใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadAllDatabaseFromSheets(forceRefresh = true): Promise<HydratedDatabaseState> {
  if (!forceRefresh && cachedState) {
    return cachedState;
  }
  if (inflightLoadPromise) {
    return inflightLoadPromise;
  }

  inflightLoadPromise = (async () => {
    const data = await fetchAppsScriptGet(`${DB_API_URL}?action=loadAllDatabase`);
    const rawDb = (data.database || {}) as Partial<GoogleSheetsDatabasePayload>;
    const hydrated = hydrateDatabasePayload(rawDb);
    cachedState = hydrated;
    return hydrated;
  })();

  try {
    return await inflightLoadPromise;
  } finally {
    inflightLoadPromise = null;
  }
}

export function buildSyncTableRequestPayload(
  table: GoogleSheetTableName,
  records: SheetRecordRow[]
) {
  return {
    action: 'syncTable' as const,
    table,
    records,
  };
}

export async function syncTableToSheets(
  table: GoogleSheetTableName,
  records: SheetRecordRow[]
): Promise<void> {
  await fetchAppsScriptPost(buildSyncTableRequestPayload(table, records));
  if (cachedState) {
    cachedState.rawDatabase[table] = records;
  }
}

export function buildUploadFileRequestPayload(params: {
  studentId: string;
  fileName: string;
  mimeType: string;
  base64Data: string;
}) {
  return {
    action: 'uploadFile' as const,
    studentId: params.studentId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    base64Data: stripBase64DataUrlPrefix(params.base64Data),
  };
}

export async function uploadFileToSheetsDrive(
  file: File,
  studentId: string
): Promise<UploadedFileMeta> {
  if (!file || file.size === 0) {
    throw new Error('ไม่พบไฟล์หรือไฟล์ว่างเปล่า');
  }
  if (file.size > MAX_DRIVE_UPLOAD_BYTES) {
    throw new Error(`ขนาดไฟล์ "${file.name}" เกินกำหนดสูงสุด 3 MB ต่อไฟล์`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
    reader.readAsDataURL(file);
  });

  const cleanBase64 = stripBase64DataUrlPrefix(dataUrl);
  const payload = buildUploadFileRequestPayload({
    studentId: studentId.trim() || 'general',
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64Data: cleanBase64,
  });

  const result = await fetchAppsScriptPost(payload, 60_000);
  const fileUrl = String(result.fileUrl || result.url || result.webViewLink || '').trim();
  if (!fileUrl) {
    throw new Error('อัปโหลดสำเร็จแต่ไม่ได้รับ URL ไฟล์จาก Google Drive');
  }

  const driveFileId =
    String(result.fileId || '').trim() || extractGoogleDriveFileId(fileUrl);

  return {
    id: `drv_${driveFileId || Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    url: fileUrl,
    uploadedAt: new Date().toISOString(),
    storageProvider: 'google_drive',
    ...(driveFileId ? { driveFileId } : {}),
    driveWebViewLink: fileUrl,
  };
}

export function extractAllStudentRowsForSync(state: HydratedDatabaseState): SheetRecordRow[] {
  return state.students.map((s) => {
    const storedAuth = state.studentAuthMap.get(s.user.id) || {
      ...s.user,
    };
    return serializeStudentRow(storedAuth, s.basicInfo);
  });
}

export function extractAllApplicationRowsForSync(state: HydratedDatabaseState): SheetRecordRow[] {
  const rows: SheetRecordRow[] = [];
  for (const s of state.students) {
    if (s.application) {
      rows.push(serializeApplicationRow(s.application));
    }
  }
  return rows;
}

export function extractAllGradeRowsForSync(state: HydratedDatabaseState): SheetRecordRow[] {
  const rows: SheetRecordRow[] = [];
  for (const s of state.students) {
    for (const g of s.grades) {
      rows.push(serializeGradeRow(g));
    }
  }
  return rows;
}

export function extractAllVolunteerRowsForSync(state: HydratedDatabaseState): SheetRecordRow[] {
  const rows: SheetRecordRow[] = [];
  for (const s of state.students) {
    for (const v of s.volunteers) {
      rows.push(serializeVolunteerRow(v));
    }
  }
  return rows;
}
