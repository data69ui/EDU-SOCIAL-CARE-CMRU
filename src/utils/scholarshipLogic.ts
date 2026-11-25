import type {
  AcademicYear,
  ApplicationStatus,
  BasicInfoData,
  ImportedStudentRow,
  PublicOverviewStats,
  ReceivedScholarshipItem,
  ScholarshipApplicationData,
  ScholarshipCategorySummary,
  StudentFullRecord,
  UserRole,
  VolunteerRecord,
  YearLevel,
  YearLevelSummaryBucket,
} from '../types/scholarship';

export const ACADEMIC_YEARS: AcademicYear[] = [
  '2569',
  '2570',
  '2571',
  '2572',
  '2573',
  '2574',
  '2575',
];

export const YEAR_LEVELS: YearLevel[] = ['ปี 1', 'ปี 2', 'ปี 3', 'ปี 4'];

export const CMRU_STUDENT_DOMAIN = '@g.cmru.ac.th';

export function validateCmruStudentEmail(email: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { valid: false, normalized, error: 'กรุณากรอกอีเมลนักศึกษา' };
  }
  const basicEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicEmailPattern.test(normalized)) {
    return { valid: false, normalized, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
  }
  if (!normalized.endsWith(CMRU_STUDENT_DOMAIN)) {
    return {
      valid: false,
      normalized,
      error: 'อนุญาตเฉพาะอีเมล์ Google ของมหาวิทยาลัย @g.cmru.ac.th เท่านั้น',
    };
  }
  return { valid: true, normalized };
}

export function inferStudentIdFromCmruEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith(CMRU_STUDENT_DOMAIN)) return '';
  const localPart = normalized.slice(0, -CMRU_STUDENT_DOMAIN.length);
  return /^[a-z0-9._-]+$/i.test(localPart) ? localPart : '';
}

export function validateStudentId(studentId: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = studentId.trim();
  if (!normalized) {
    return { valid: false, normalized, error: 'กรุณากรอกรหัสนักศึกษา 8 หลัก' };
  }
  if (!/^\d{8}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'กรุณากรอกรหัสนักศึกษาเป็นตัวเลข 8 หลัก (เช่น 69xxxxxx)',
    };
  }
  return { valid: true, normalized };
}

export function validateStudentRegistrationPayload(input: {
  studentId: string;
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}): {
  valid: boolean;
  normalizedStudentId: string;
  normalizedEmail: string;
  error?: string;
} {
  const idCheck = validateStudentId(input.studentId);
  if (!idCheck.valid) {
    return {
      valid: false,
      normalizedStudentId: idCheck.normalized,
      normalizedEmail: '',
      error: idCheck.error,
    };
  }

  const normalizedEmail = (input.email || '').trim().toLowerCase();
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return {
      valid: false,
      normalizedStudentId: idCheck.normalized,
      normalizedEmail,
      error: 'รูปแบบอีเมลไม่ถูกต้อง',
    };
  }

  if (input.password !== undefined && input.password !== '') {
    if (input.password.length < 4) {
      return {
        valid: false,
        normalizedStudentId: idCheck.normalized,
        normalizedEmail,
        error: 'กรุณากำหนดรหัสผ่านอย่างน้อย 4 ตัวอักษร',
      };
    }
    if (
      input.confirmPassword !== undefined &&
      input.password !== input.confirmPassword
    ) {
      return {
        valid: false,
        normalizedStudentId: idCheck.normalized,
        normalizedEmail,
        error: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน',
      };
    }
  }

  return {
    valid: true,
    normalizedStudentId: idCheck.normalized,
    normalizedEmail,
  };
}

export const MIN_STRONG_PASSWORD_LENGTH = 10;
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 นาที

export function buildDefaultStudentPassword(studentId: string): string {
  const normalized = studentId.trim();
  return /^\d{8}$/.test(normalized) ? normalized : '';
}

export function evaluatePasswordStrength(password: string): {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
  valid: boolean;
} {
  const value = String(password ?? '');
  const minLength = value.length >= MIN_STRONG_PASSWORD_LENGTH;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  return {
    minLength,
    hasUpper,
    hasLower,
    hasDigit,
    valid: minLength && hasUpper && hasLower && hasDigit,
  };
}

export function validateStrongPassword(password: string): {
  valid: boolean;
  error?: string;
} {
  const checks = evaluatePasswordStrength(password);
  if (!checks.minLength) {
    return {
      valid: false,
      error: `รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย ${MIN_STRONG_PASSWORD_LENGTH} ตัวอักษร`,
    };
  }
  if (!checks.hasUpper) {
    return {
      valid: false,
      error: 'รหัสผ่านใหม่ต้องมีตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว',
    };
  }
  if (!checks.hasLower) {
    return {
      valid: false,
      error: 'รหัสผ่านใหม่ต้องมีตัวอักษรภาษาอังกฤษพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว',
    };
  }
  if (!checks.hasDigit) {
    return {
      valid: false,
      error: 'รหัสผ่านใหม่ต้องมีตัวเลข (0-9) อย่างน้อย 1 ตัว',
    };
  }
  return { valid: true };
}

export function validatePasswordChangePayload(params: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): { valid: boolean; error?: string } {
  if (!params.currentPassword) {
    return { valid: false, error: 'กรุณากรอกรหัสผ่านปัจจุบัน' };
  }
  const strongCheck = validateStrongPassword(params.newPassword);
  if (!strongCheck.valid) {
    return strongCheck;
  }
  if (params.newPassword === params.currentPassword) {
    return {
      valid: false,
      error: 'รหัสผ่านใหม่ต้องไม่ตรงกับรหัสผ่านเดิม',
    };
  }
  if (params.confirmPassword !== params.newPassword) {
    return {
      valid: false,
      error: 'รหัสผ่านใหม่และยืนยันรหัสผ่านใหม่ไม่ตรงกัน',
    };
  }
  return { valid: true };
}

export function formatRemainingLockoutDuration(remainingMs: number): string {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0 && seconds > 0) {
    return `${minutes} นาที ${seconds} วินาที`;
  }
  if (minutes > 0) {
    return `${minutes} นาที`;
  }
  return `${seconds} วินาที`;
}

export function evaluateLoginAttemptStatus(params: {
  failedLoginAttempts?: number;
  lockedUntil?: string;
  nowMs?: number;
}): {
  isLocked: boolean;
  remainingMs: number;
  activeFailedAttempts: number;
  remainingAttempts: number;
  errorMessage?: string;
} {
  const nowMs = params.nowMs ?? Date.now();
  const lockedUntilMs = params.lockedUntil ? Date.parse(params.lockedUntil) : NaN;

  if (!Number.isNaN(lockedUntilMs)) {
    if (nowMs < lockedUntilMs) {
      const remainingMs = lockedUntilMs - nowMs;
      return {
        isLocked: true,
        remainingMs,
        activeFailedAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        remainingAttempts: 0,
        errorMessage: `กรอกรหัสผ่านผิดเกิน ${MAX_FAILED_LOGIN_ATTEMPTS} ครั้ง บัญชีถูกระงับชั่วคราว กรุณาลองใหม่อีกครั้งใน ${formatRemainingLockoutDuration(remainingMs)}`,
      };
    }
    // Lockout window has elapsed -> reset counter
    return {
      isLocked: false,
      remainingMs: 0,
      activeFailedAttempts: 0,
      remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
    };
  }

  const activeFailedAttempts = Math.max(0, Number(params.failedLoginAttempts || 0));
  return {
    isLocked: false,
    remainingMs: 0,
    activeFailedAttempts,
    remainingAttempts: Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - activeFailedAttempts),
  };
}

export function recordFailedAttemptState(params: {
  failedLoginAttempts?: number;
  lockedUntil?: string;
  nowMs?: number;
}): {
  failedLoginAttempts: number;
  lockedUntil?: string;
  isNowLocked: boolean;
  remainingAttempts: number;
  errorMessage: string;
} {
  const nowMs = params.nowMs ?? Date.now();
  const status = evaluateLoginAttemptStatus({
    failedLoginAttempts: params.failedLoginAttempts,
    lockedUntil: params.lockedUntil,
    nowMs,
  });

  if (status.isLocked) {
    return {
      failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
      lockedUntil: params.lockedUntil,
      isNowLocked: true,
      remainingAttempts: 0,
      errorMessage: status.errorMessage!,
    };
  }

  const nextAttempts = status.activeFailedAttempts + 1;
  if (nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(nowMs + LOGIN_LOCKOUT_DURATION_MS).toISOString();
    return {
      failedLoginAttempts: nextAttempts,
      lockedUntil,
      isNowLocked: true,
      remainingAttempts: 0,
      errorMessage: `กรอกรหัสผ่านผิดครบ ${MAX_FAILED_LOGIN_ATTEMPTS} ครั้ง บัญชีถูกระงับการใช้งานชั่วคราวเป็นเวลา ${formatRemainingLockoutDuration(LOGIN_LOCKOUT_DURATION_MS)}`,
    };
  }

  const remainingAttempts = MAX_FAILED_LOGIN_ATTEMPTS - nextAttempts;
  return {
    failedLoginAttempts: nextAttempts,
    lockedUntil: undefined,
    isNowLocked: false,
    remainingAttempts,
    errorMessage: `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลือโอกาสอีก ${remainingAttempts} ครั้งก่อนถูกระงับชั่วคราว)`,
  };
}

export function generateVerificationCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export function verifyVerificationCode(input: string, expected: string): boolean {
  return input.trim() === expected.trim() && expected.trim().length > 0;
}

export interface FileConstraintOptions {
  maxSizeMB: number;
  allowPdf: boolean;
}

export function validateUploadFile(
  file: { name: string; size: number; type: string },
  options: FileConstraintOptions
): { valid: boolean; error?: string } {
  const allowedImageMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedImageExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const lowerName = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();

  const isImage =
    allowedImageMimes.includes(mime) ||
    allowedImageExts.some((ext) => lowerName.endsWith(ext));
  const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf');

  if (!isImage && !(options.allowPdf && isPdf)) {
    return {
      valid: false,
      error: options.allowPdf
        ? 'รองรับเฉพาะไฟล์ PDF, JPG, PNG และ WEBP เท่านั้น'
        : 'รองรับเฉพาะไฟล์รูปภาพ JPG, PNG และ WEBP เท่านั้น',
    };
  }

  const maxBytes = options.maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `ขนาดไฟล์ "${file.name}" เกินกำหนด ${options.maxSizeMB} MB`,
    };
  }

  return { valid: true };
}

export function isVolunteerModuleUnlocked(
  application: Pick<ScholarshipApplicationData, 'status'> | null | undefined
): boolean {
  return application?.status === 'approved';
}

export function calculateApprovedVolunteerHours(records: VolunteerRecord[]): {
  approvedHours: number;
  pendingHours: number;
  totalSubmittedCount: number;
} {
  let approvedHours = 0;
  let pendingHours = 0;

  for (const rec of records) {
    if (rec.approvalStatus === 'approved') {
      approvedHours += Number(rec.approvedHours || rec.hours || 0);
    } else if (rec.approvalStatus === 'pending') {
      pendingHours += Number(rec.hours || 0);
    }
  }

  return {
    approvedHours,
    pendingHours,
    totalSubmittedCount: records.length,
  };
}

export function getApplicationStatusMeta(status: ApplicationStatus | null | undefined): {
  label: string;
  description: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
  step: number;
} {
  switch (status) {
    case 'draft':
      return {
        label: 'ฉบับร่าง',
        description: 'บันทึกข้อมูลชั่วคราว ยังไม่ได้ยื่นส่งให้คณะกรรมการพิจารณา',
        tone: 'neutral',
        step: 1,
      };
    case 'submitted':
      return {
        label: 'ยื่นใบสมัครแล้ว (รอพิจารณา)',
        description: 'ส่งข้อมูลไปยังอาจารย์และผู้ดูแลระบบเรียบร้อยแล้ว',
        tone: 'info',
        step: 2,
      };
    case 'reviewing':
      return {
        label: 'อาจารย์กำลังพิจารณา',
        description: 'อาจารย์ประจำสาขาวิชาสังคมศึกษากำลังตรวจสอบคุณสมบัติและเอกสาร',
        tone: 'warning',
        step: 3,
      };
    case 'needs_revision':
      return {
        label: 'ขอข้อมูล/เอกสารเพิ่มเติม',
        description: 'กรุณาตรวจสอบความคิดเห็นจากอาจารย์และปรับปรุงข้อมูล',
        tone: 'warning',
        step: 2,
      };
    case 'approved':
      return {
        label: 'อนุมัติทุนการศึกษาเรียบร้อยแล้ว',
        description: 'คุณได้รับคัดเลือกทุนการศึกษา ระบบบันทึกจิตอาสาเปิดใช้งานแล้ว',
        tone: 'success',
        step: 4,
      };
    case 'rejected':
      return {
        label: 'ไม่ผ่านการพิจารณา',
        description: 'ยังไม่ผ่านเกณฑ์การพิจารณาทุนในรอบนี้ กรุณาอ่านคำแนะนำจากอาจารย์',
        tone: 'danger',
        step: 4,
      };
    default:
      return {
        label: 'ยังไม่ได้สมัครทุนการศึกษา',
        description: 'กรุณากรอกข้อมูลพื้นฐานและยื่นใบสมัครทุนการศึกษา',
        tone: 'neutral',
        step: 0,
      };
  }
}

export function canResetUserPassword(actorRole: UserRole): boolean {
  return actorRole === 'admin';
}

export function canDeleteUserAccount(params: {
  actorRole: UserRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: UserRole;
  adminCount: number;
}): { allowed: boolean; reason?: string } {
  if (params.actorRole !== 'admin' && params.actorUserId !== params.targetUserId) {
    return {
      allowed: false,
      reason: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบบัญชีผู้อื่นได้',
    };
  }
  if (params.actorRole === 'admin' && params.actorUserId === params.targetUserId) {
    return {
      allowed: false,
      reason: 'ไม่สามารถลบบัญชีผู้ดูแลระบบที่กำลังใช้งานอยู่ได้',
    };
  }
  if (params.targetRole === 'admin' && params.adminCount <= 1) {
    return {
      allowed: false,
      reason: 'ต้องมีบัญชีผู้ดูแลระบบอย่างน้อย 1 บัญชีในระบบ',
    };
  }
  return { allowed: true };
}

export function createEmptyParentInfo() {
  return {
    fullName: '',
    status: '' as const,
    age: '',
    occupation: '',
    workplace: '',
    monthlyIncome: '',
    phone: '',
  };
}

export function createEmptyBasicInfo(email = '', fullName = '', studentId = ''): BasicInfoData {
  return {
    pdpaConsented: false,
    pdpaDeclined: false,
    profilePhoto: null,
    academicYear: '2569',
    yearLevel: 'ปี 1',
    studentId,
    fullName,
    cohort: '',
    phone: '',
    gpax: '',
    gpaTerm1: '',
    gpaTerm2: '',
    birthDate: '',
    age: '',
    nationality: 'ไทย',
    ethnicity: 'ไทย',
    religion: 'พุทธ',
    email,
    facebook: '',
    registeredAddress: '',
    currentAddress: '',
    monthlyAllowance: '',
    hasChronicDisease: 'ไม่มี',
    chronicDiseaseDetail: '',
    hasStudentLoan: 'ไม่กู้',
    studentLoanYear: '',
    hasOtherScholarship: 'ไม่ได้รับทุน',
    otherScholarshipDetail: '',
    receivedScholarships: [],
    hasPartTimeJob: 'ไม่ทำ',
    partTimeJobDetail: '',
    father: createEmptyParentInfo(),
    mother: createEmptyParentInfo(),
    parentsMaritalStatus: 'อยู่ด้วยกัน',
    parentsMaritalStatusOther: '',
    guardian: {
      ...createEmptyParentInfo(),
      relationship: '',
    },
    familyMemberCount: '',
    livingWith: 'พ่อ',
    livingWithOther: '',
    necessityReason: '',
    spendingPlan: '',
    housePhotos: [],
    supportingDocs: [],
    documentNote: '',
    isDraft: true,
  };
}

export function normalizeScholarshipName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getScholarshipGroupingKey(name: string): string {
  return normalizeScholarshipName(name).toLowerCase();
}

export function sanitizeReceivedScholarships(
  items?: ReceivedScholarshipItem[],
  fallbackDetail?: string
): ReceivedScholarshipItem[] {
  const source: ReceivedScholarshipItem[] =
    Array.isArray(items) && items.length > 0
      ? items
      : String(fallbackDetail || '')
          .split(/[\n,;]+/)
          .map((part, idx) => ({
            id: `sch_legacy_${idx + 1}`,
            name: part,
          }));

  const seenKeys = new Set<string>();
  const cleaned: ReceivedScholarshipItem[] = [];

  for (let idx = 0; idx < source.length; idx += 1) {
    const raw = source[idx];
    const name = normalizeScholarshipName(raw?.name || '');
    if (!name) continue;
    const key = getScholarshipGroupingKey(name);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const provider = normalizeScholarshipName(raw?.provider || '');
    cleaned.push({
      id: raw?.id && String(raw.id).trim() ? String(raw.id).trim() : `sch_${idx + 1}`,
      name,
      ...(provider ? { provider } : {}),
    });
  }

  return cleaned;
}

export function formatReceivedScholarshipsText(basicInfo: BasicInfoData): string {
  if (basicInfo.hasOtherScholarship !== 'ได้รับทุน') return '';
  const cleaned = sanitizeReceivedScholarships(
    basicInfo.receivedScholarships,
    basicInfo.otherScholarshipDetail
  );
  if (cleaned.length > 0) {
    return cleaned
      .map((s) => (s.provider ? `${s.name} (${s.provider})` : s.name))
      .join(', ');
  }
  return normalizeScholarshipName(basicInfo.otherScholarshipDetail);
}

export function extractConfirmedReceivedScholarships(
  basicInfo: BasicInfoData | null | undefined
): ReceivedScholarshipItem[] {
  if (!basicInfo) return [];
  if (basicInfo.isDraft) return [];
  if (!basicInfo.pdpaConsented) return [];
  if (basicInfo.hasOtherScholarship !== 'ได้รับทุน') return [];
  return sanitizeReceivedScholarships(
    basicInfo.receivedScholarships,
    basicInfo.otherScholarshipDetail
  );
}

export function buildScholarshipRecipientsSummary(
  records: StudentFullRecord[]
): ScholarshipCategorySummary[] {
  const groups = new Map<
    string,
    {
      scholarshipKey: string;
      scholarshipName: string;
      seenUserIds: Set<string>;
      recipients: ScholarshipCategorySummary['recipients'];
    }
  >();

  for (const rec of records) {
    const confirmedItems = extractConfirmedReceivedScholarships(rec.basicInfo);
    if (confirmedItems.length === 0) continue;

    const studentUserId = rec.user.id;
    const studentId = rec.basicInfo.studentId || rec.user.studentId || '-';
    const fullName = rec.basicInfo.fullName || rec.user.fullName || '-';
    const yearLevel = (rec.application?.yearLevel || rec.basicInfo.yearLevel || 'ปี 1') as YearLevel;
    const academicYear = (rec.application?.academicYear ||
      rec.basicInfo.academicYear ||
      '2569') as AcademicYear;

    for (const item of confirmedItems) {
      const key = getScholarshipGroupingKey(item.name);
      if (!key) continue;

      let group = groups.get(key);
      if (!group) {
        group = {
          scholarshipKey: key,
          scholarshipName: item.name,
          seenUserIds: new Set<string>(),
          recipients: [],
        };
        groups.set(key, group);
      }

      if (group.seenUserIds.has(studentUserId)) {
        continue;
      }
      group.seenUserIds.add(studentUserId);
      group.recipients.push({
        studentUserId,
        studentId,
        fullName,
        yearLevel,
        academicYear,
        ...(item.provider ? { provider: item.provider } : {}),
      });
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      scholarshipKey: group.scholarshipKey,
      scholarshipName: group.scholarshipName,
      recipientCount: group.recipients.length,
      recipients: group.recipients.sort((a, b) =>
        a.studentId.localeCompare(b.studentId, 'th') || a.fullName.localeCompare(b.fullName, 'th')
      ),
    }))
    .sort(
      (a, b) =>
        b.recipientCount - a.recipientCount ||
        a.scholarshipName.localeCompare(b.scholarshipName, 'th')
    );
}

export function parseFreeTextAddress(text: string) {
  return {
    houseNo: text.trim() || '',
    alleyRoad: '',
    subDistrict: '',
    district: '',
    province: 'เชียงใหม่',
    postalCode: '',
  };
}

export function prefillApplicationFromBasicInfo(
  basic: BasicInfoData,
  existing: ScholarshipApplicationData | null,
  studentUserId: string
): ScholarshipApplicationData {
  const mappedMarital: ScholarshipApplicationData['parentsMaritalStatus'] =
    basic.parentsMaritalStatus === 'อยู่ด้วยกัน'
      ? 'อยู่ด้วยกัน'
      : basic.parentsMaritalStatus === 'แยกกันอยู่'
        ? 'แยกกันอยู่ตามอาชีพ'
        : basic.parentsMaritalStatus === 'หย่าร้าง'
          ? 'หย่า'
          : 'อื่นๆ';

  const mappedMaritalOther =
    basic.parentsMaritalStatus === 'บิดาเสียชีวิต' || basic.parentsMaritalStatus === 'มารดาเสียชีวิต'
      ? basic.parentsMaritalStatus
      : basic.parentsMaritalStatusOther;

  const base: ScholarshipApplicationData = existing
    ? { ...existing }
    : {
        id: `app_${studentUserId}`,
        studentUserId,
        academicYear: basic.academicYear || '2569',
        yearLevel: basic.yearLevel || 'ปี 1',
        fullName: '',
        studentId: '',
        yearAndSection: '',
        gpax: '',
        birthDate: '',
        age: '',
        nationality: 'ไทย',
        ethnicity: 'ไทย',
        religion: 'พุทธ',
        phone: '',
        facebook: '',
        registeredAddress: parseFreeTextAddress(basic.registeredAddress),
        currentAddress: parseFreeTextAddress(basic.currentAddress),
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
        father: { ...basic.father },
        mother: { ...basic.mother },
        parentsMaritalStatus: mappedMarital,
        parentsMaritalStatusOther: mappedMaritalOther,
        guardian: { ...basic.guardian },
        householdMembersCount: basic.familyMemberCount || '',
        housingStatus: 'บ้านของตนเอง',
        housingStatusOther: '',
        currentlyLivingWith: '',
        financialProblemDetail: '',
        scholarshipNecessityDetail: '',
        expectedBenefitDetail: '',
        indoorHousePhotos: [],
        indoorFamilyPhotos: [],
        outdoorHousePhotos: [],
        outdoorFamilyPhotos: [],
        status: 'draft',
        advisorComment: '',
        updatedAt: new Date().toISOString(),
      };

  return {
    ...base,
    academicYear: basic.academicYear || base.academicYear,
    yearLevel: basic.yearLevel || base.yearLevel,
    fullName: base.fullName || basic.fullName,
    studentId: base.studentId || basic.studentId,
    yearAndSection:
      base.yearAndSection ||
      [basic.yearLevel, basic.cohort ? `รุ่น ${basic.cohort}` : ''].filter(Boolean).join(' / '),
    gpax: base.gpax || basic.gpax,
    birthDate: base.birthDate || basic.birthDate,
    age: base.age || basic.age,
    nationality: base.nationality || basic.nationality,
    ethnicity: base.ethnicity || basic.ethnicity,
    religion: base.religion || basic.religion,
    phone: base.phone || basic.phone,
    facebook: base.facebook || basic.facebook,
    registeredAddress: base.registeredAddress.houseNo
      ? base.registeredAddress
      : parseFreeTextAddress(basic.registeredAddress),
    currentAddress: base.currentAddress.houseNo
      ? base.currentAddress
      : parseFreeTextAddress(basic.currentAddress),
    monthlyExpenses: base.monthlyExpenses || basic.monthlyAllowance,
    hasChronicDisease: basic.hasChronicDisease || base.hasChronicDisease,
    chronicDiseaseDetail: base.chronicDiseaseDetail || basic.chronicDiseaseDetail,
    hasStudentLoan: basic.hasStudentLoan === 'กู้' ? 'กู้ กยศ.' : 'ไม่กู้ กยศ.',
    hasOtherScholarship: basic.hasOtherScholarship === 'ได้รับทุน' ? 'ได้รับ' : 'ไม่ได้รับ',
    otherScholarshipNameAmount:
      base.otherScholarshipNameAmount || formatReceivedScholarshipsText(basic),
    hasPartTimeJob: basic.hasPartTimeJob === 'ทำ' ? 'ทำงาน' : 'ไม่ได้ทำงาน',
    partTimeJobDetailIncome: base.partTimeJobDetailIncome || basic.partTimeJobDetail,
    father: base.father.fullName ? base.father : { ...basic.father },
    mother: base.mother.fullName ? base.mother : { ...basic.mother },
    guardian: base.guardian.fullName ? base.guardian : { ...basic.guardian },
    parentsMaritalStatus: existing ? base.parentsMaritalStatus : mappedMarital,
    parentsMaritalStatusOther: existing ? base.parentsMaritalStatusOther : mappedMaritalOther,
    householdMembersCount: base.householdMembersCount || basic.familyMemberCount,
    currentlyLivingWith:
      base.currentlyLivingWith ||
      (basic.livingWith === 'อื่นๆ' ? basic.livingWithOther : basic.livingWith),
    scholarshipNecessityDetail: base.scholarshipNecessityDetail || basic.necessityReason,
    expectedBenefitDetail: base.expectedBenefitDetail || basic.spendingPlan,
  };
}

export function filterStudentRecords(
  records: StudentFullRecord[],
  filters: {
    academicYear: AcademicYear | 'all';
    yearLevel: YearLevel | 'all';
    status?: ApplicationStatus | 'all';
    searchQuery?: string;
  }
): StudentFullRecord[] {
  const query = (filters.searchQuery || '').trim().toLowerCase();

  return records.filter((rec) => {
    const appYear = rec.application?.academicYear || rec.basicInfo.academicYear;
    const appLevel = rec.application?.yearLevel || rec.basicInfo.yearLevel;
    const appStatus = rec.application?.status || 'draft';

    if (filters.academicYear !== 'all' && appYear !== filters.academicYear) {
      return false;
    }
    if (filters.yearLevel !== 'all' && appLevel !== filters.yearLevel) {
      return false;
    }
    if (filters.status && filters.status !== 'all' && appStatus !== filters.status) {
      return false;
    }
    if (query) {
      const haystack = [
        rec.user.fullName,
        rec.user.studentId,
        rec.user.email,
        rec.basicInfo.fullName,
        rec.basicInfo.studentId,
        rec.application?.fullName,
        rec.application?.studentId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function buildPublicOverviewStats(
  allRecords: StudentFullRecord[],
  filterAcademicYear: AcademicYear | 'all' = 'all',
  filterYearLevel: YearLevel | 'all' = 'all'
): PublicOverviewStats {
  const yearFiltered = filterStudentRecords(allRecords, {
    academicYear: filterAcademicYear,
    yearLevel: 'all',
  });

  const yearLevelCounts = YEAR_LEVELS.map((yearLevel) => ({
    yearLevel,
    total: yearFiltered.filter(
      (r) => (r.application?.yearLevel || r.basicInfo.yearLevel) === yearLevel
    ).length,
  }));

  const academicYearCounts = ACADEMIC_YEARS.map((academicYear) => ({
    academicYear,
    count: allRecords.filter(
      (r) => (r.application?.academicYear || r.basicInfo.academicYear) === academicYear
    ).length,
  })).filter((entry) => entry.count > 0 || entry.academicYear === '2569' || entry.academicYear === '2570');

  const filtered = filterStudentRecords(allRecords, {
    academicYear: filterAcademicYear,
    yearLevel: filterYearLevel,
  });

  let approvedCount = 0;
  let pendingCount = 0;
  let needsRevisionOrRejectedCount = 0;
  let draftOrNoAppCount = 0;
  let loanCount = 0;
  let pdpaConsentedCount = 0;
  let gradeRecordsCount = 0;
  let gpaxSum = 0;
  let gpaxN = 0;
  let approvedVolunteerHours = 0;
  let pendingVolunteerHours = 0;

  const bucketMap = new Map<YearLevel, YearLevelSummaryBucket>();
  for (const yl of YEAR_LEVELS) {
    bucketMap.set(yl, {
      yearLevel: yl,
      total: 0,
      approved: 0,
      pending: 0,
      draft: 0,
      loanCount: 0,
    });
  }

  for (const rec of filtered) {
    const yl = (rec.application?.yearLevel || rec.basicInfo.yearLevel || 'ปี 1') as YearLevel;
    const bucket = bucketMap.get(yl);
    const status = rec.application?.status;
    const hasLoan =
      rec.basicInfo.hasStudentLoan === 'กู้' ||
      rec.application?.hasStudentLoan === 'กู้ กยศ.';

    if (bucket) {
      bucket.total += 1;
      if (hasLoan) bucket.loanCount += 1;
    }

    if (status === 'approved') {
      approvedCount += 1;
      if (bucket) bucket.approved += 1;
    } else if (status === 'submitted' || status === 'reviewing') {
      pendingCount += 1;
      if (bucket) bucket.pending += 1;
    } else if (status === 'needs_revision' || status === 'rejected') {
      needsRevisionOrRejectedCount += 1;
      if (bucket) bucket.pending += 1;
    } else {
      draftOrNoAppCount += 1;
      if (bucket) bucket.draft += 1;
    }

    if (hasLoan) loanCount += 1;
    if (rec.basicInfo.pdpaConsented) pdpaConsentedCount += 1;

    gradeRecordsCount += rec.grades.length;

    const rawGpax = parseFloat(rec.application?.gpax || rec.basicInfo.gpax || '');
    if (!Number.isNaN(rawGpax) && rawGpax > 0 && rawGpax <= 4) {
      gpaxSum += rawGpax;
      gpaxN += 1;
    }

    const vol = calculateApprovedVolunteerHours(rec.volunteers);
    approvedVolunteerHours += vol.approvedHours;
    pendingVolunteerHours += vol.pendingHours;
  }

  return {
    totalAllStudents: allRecords.length,
    filteredTotal: filtered.length,
    approvedCount,
    pendingCount,
    needsRevisionOrRejectedCount,
    draftOrNoAppCount,
    loanCount,
    pdpaConsentedCount,
    gradeRecordsCount,
    averageGpax: gpaxN > 0 ? (gpaxSum / gpaxN).toFixed(2) : '0.00',
    approvedVolunteerHours,
    pendingVolunteerHours,
    yearLevelCounts,
    academicYearCounts,
    byYearLevel: Array.from(bucketMap.values()),
    scholarshipSummary: buildScholarshipRecipientsSummary(filtered),
  };
}

export function normalizeExcelAcademicYear(val: unknown): AcademicYear {
  const raw = String(val ?? '').trim();
  const found = ACADEMIC_YEARS.find((y) => y === raw);
  return found || '2569';
}

export function normalizeExcelYearLevel(val: unknown): YearLevel {
  const raw = String(val ?? '').trim().replace(/\s+/g, ' ');
  if (raw === '1' || raw === 'ปี1' || raw === 'ปี 1' || raw === 'ชั้นปีที่ 1') return 'ปี 1';
  if (raw === '2' || raw === 'ปี2' || raw === 'ปี 2' || raw === 'ชั้นปีที่ 2') return 'ปี 2';
  if (raw === '3' || raw === 'ปี3' || raw === 'ปี 3' || raw === 'ชั้นปีที่ 3') return 'ปี 3';
  if (raw === '4' || raw === 'ปี4' || raw === 'ปี 4' || raw === 'ชั้นปีที่ 4') return 'ปี 4';
  const found = YEAR_LEVELS.find((l) => l === raw);
  return found || 'ปี 1';
}

export function normalizeExcelLoanStatus(val: unknown): 'กู้' | 'ไม่กู้' {
  const raw = String(val ?? '').trim().toLowerCase();
  if (!raw) return 'ไม่กู้';
  if (
    raw === 'กู้' ||
    raw === 'กู้ กยศ.' ||
    raw === 'กู้ยืม' ||
    raw === 'yes' ||
    raw === 'true' ||
    raw === '1'
  ) {
    return 'กู้';
  }
  return 'ไม่กู้';
}

function readRowField(normalizedRow: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    if (normalizedRow[alias] !== undefined && normalizedRow[alias] !== '') {
      return normalizedRow[alias];
    }
  }
  return '';
}

export function parseExcelStudentRows(rawRows: Record<string, unknown>[]): {
  validRows: ImportedStudentRow[];
  errors: { rowNumber: number; message: string }[];
} {
  const validRows: ImportedStudentRow[] = [];
  const errors: { rowNumber: number; message: string }[] = [];
  const seenStudentIds = new Set<string>();

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // +2 accounts for 1-based Excel header row
    const normalizedRow: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      const cleanKey = k.trim().toLowerCase().replace(/\s+/g, ' ');
      normalizedRow[cleanKey] = String(v ?? '').trim();
    }

    const allEmpty = Object.values(normalizedRow).every((v) => v === '');
    if (allEmpty) return;

    const studentId = readRowField(normalizedRow, [
      'รหัสนักศึกษา',
      'รหัส',
      'studentid',
      'student_id',
      'student id',
      'id',
    ]);
    const fullName = readRowField(normalizedRow, [
      'ชื่อ-นามสกุล',
      'ชื่อ-สกุล',
      'ชื่อสกุล',
      'ชื่อ',
      'fullname',
      'full_name',
      'full name',
      'name',
    ]);
    const email = readRowField(normalizedRow, [
      'อีเมล (ไม่บังคับ)',
      'อีเมล (@g.cmru.ac.th)',
      'อีเมล',
      'email',
      'mail',
    ]);
    const rawYear = readRowField(normalizedRow, [
      'ปีการศึกษา',
      'academicyear',
      'academic_year',
      'academic year',
    ]);
    const rawLevel = readRowField(normalizedRow, [
      'ชั้นปี',
      'ระดับชั้น',
      'yearlevel',
      'year_level',
      'year level',
    ]);
    const rawGpax = readRowField(normalizedRow, [
      'gpax',
      'เกรดเฉลี่ยสะสม',
      'เกรดเฉลี่ย',
      'gpa',
    ]);
    const phone = readRowField(normalizedRow, [
      'เบอร์โทรศัพท์',
      'เบอร์โทร',
      'โทรศัพท์',
      'phone',
      'tel',
    ]);
    const rawLoan = readRowField(normalizedRow, [
      'กยศ. (กู้/ไม่กู้)',
      'กยศ.',
      'กยศ',
      'กู้ยืม',
      'hasstudentloan',
      'loan',
    ]);
    const password = readRowField(normalizedRow, [
      'รหัสผ่านเริ่มต้น (เว้นว่างใช้รหัสนักศึกษา)',
      'รหัสผ่านเริ่มต้น (เว้นว่างใช้ cmru+รหัส)',
      'รหัสผ่านเริ่มต้น',
      'รหัสผ่าน',
      'password',
    ]);

    const idCheck = validateStudentId(studentId);
    if (!idCheck.valid) {
      errors.push({
        rowNumber,
        message: `แถวที่ ${rowNumber}: ${idCheck.error || 'ไม่พบรหัสนักศึกษา'}`,
      });
      return;
    }
    if (!fullName) {
      errors.push({ rowNumber, message: `แถวที่ ${rowNumber}: ไม่พบชื่อ-นามสกุล` });
      return;
    }

    const idKey = idCheck.normalized.toLowerCase();
    if (seenStudentIds.has(idKey)) {
      errors.push({
        rowNumber,
        message: `แถวที่ ${rowNumber}: รหัสนักศึกษา ${idCheck.normalized} ซ้ำกันในไฟล์`,
      });
      return;
    }
    seenStudentIds.add(idKey);

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      errors.push({
        rowNumber,
        message: `แถวที่ ${rowNumber} (${idCheck.normalized}): รูปแบบอีเมล "${email}" ไม่ถูกต้อง`,
      });
      return;
    }

    let cleanGpax: string | undefined;
    if (rawGpax) {
      const parsedGpax = Number(rawGpax);
      if (Number.isNaN(parsedGpax) || parsedGpax < 0 || parsedGpax > 4) {
        errors.push({
          rowNumber,
          message: `แถวที่ ${rowNumber} (${idCheck.normalized}): ค่า GPAX "${rawGpax}" ไม่ถูกต้อง (ต้องอยู่ระหว่าง 0.00 - 4.00)`,
        });
        return;
      }
      cleanGpax = parsedGpax.toFixed(2);
    }

    validRows.push({
      studentId: idCheck.normalized,
      fullName,
      email: normalizedEmail || undefined,
      academicYear: normalizeExcelAcademicYear(rawYear),
      yearLevel: normalizeExcelYearLevel(rawLevel),
      gpax: cleanGpax,
      phone: phone || undefined,
      hasStudentLoan: rawLoan ? normalizeExcelLoanStatus(rawLoan) : undefined,
      password: password || undefined,
    });
  });

  return { validRows, errors };
}

export function sanitizeCsvCell(value: string): string {
  const str = String(value ?? '');
  const safe = /^[=+@\t\r]/.test(str) || /^-[A-Za-z0-9(]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const MIN_ADMIN_PASSWORD_LENGTH = 8;

export function evaluateAdminSetupPassword(password: string): {
  minLength: boolean;
  hasLetter: boolean;
  hasDigit: boolean;
  valid: boolean;
} {
  const raw = String(password || '');
  const minLength = raw.length >= MIN_ADMIN_PASSWORD_LENGTH;
  const hasLetter = /[A-Za-z]/.test(raw);
  const hasDigit = /\d/.test(raw);
  return {
    minLength,
    hasLetter,
    hasDigit,
    valid: minLength && hasLetter && hasDigit,
  };
}

export function validateAdminSetupPayload(input: {
  fullName?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
}): { valid: boolean; normalizedUsername: string; normalizedFullName: string; error?: string } {
  const normalizedFullName = String(input.fullName || '').trim();
  if (normalizedFullName.length < 2) {
    return {
      valid: false,
      normalizedUsername: '',
      normalizedFullName,
      error: 'กรุณากรอกชื่อ-นามสกุลผู้ดูแลระบบ (อย่างน้อย 2 ตัวอักษร)',
    };
  }

  const normalizedUsername = String(input.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(normalizedUsername)) {
    return {
      valid: false,
      normalizedUsername,
      normalizedFullName,
      error:
        'ชื่อผู้ใช้งานผู้ดูแลระบบต้องมี 3-40 ตัวอักษร และใช้ได้เฉพาะภาษาอังกฤษ ตัวเลข จุด (.) ขีดล่าง (_) หรือขีดกลาง (-)',
    };
  }

  const pwd = String(input.password || '');
  const strength = evaluateAdminSetupPassword(pwd);
  if (!strength.valid) {
    return {
      valid: false,
      normalizedUsername,
      normalizedFullName,
      error: `รหัสผ่านผู้ดูแลระบบต้องมีอย่างน้อย ${MIN_ADMIN_PASSWORD_LENGTH} ตัวอักษร และประกอบด้วยตัวอักษรภาษาอังกฤษกับตัวเลข`,
    };
  }

  if (input.confirmPassword !== undefined && pwd !== input.confirmPassword) {
    return {
      valid: false,
      normalizedUsername,
      normalizedFullName,
      error: 'ยืนยันรหัสผ่านผู้ดูแลระบบไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง',
    };
  }

  return {
    valid: true,
    normalizedUsername,
    normalizedFullName,
  };
}

export function resolveAdvisorDisplayName(params: {
  reviewedBy?: string;
  currentUserRole?: UserRole;
  currentUserName?: string;
  registeredTeacherNames?: string[];
}): string {
  const explicitReviewer = String(params.reviewedBy || '').trim();
  if (explicitReviewer) {
    return explicitReviewer;
  }

  if (params.currentUserRole === 'teacher') {
    const activeTeacher = String(params.currentUserName || '').trim();
    if (activeTeacher) {
      return activeTeacher;
    }
  }

  const firstTeacher = (params.registeredTeacherNames || [])
    .map((name) => String(name || '').trim())
    .find(Boolean);
  if (firstTeacher) {
    return firstTeacher;
  }

  return '';
}

export function formatStructuredAddress(
  addr?: {
    houseNo?: string;
    alleyRoad?: string;
    subDistrict?: string;
    district?: string;
    province?: string;
    postalCode?: string;
  } | null,
  fallbackText?: string
): string {
  if (addr) {
    const parts = [
      addr.houseNo?.trim() ? `บ้านเลขที่ ${addr.houseNo.trim()}` : '',
      addr.alleyRoad?.trim() && addr.alleyRoad.trim() !== '-' ? addr.alleyRoad.trim() : '',
      addr.subDistrict?.trim() ? `ต.${addr.subDistrict.trim()}` : '',
      addr.district?.trim() ? `อ.${addr.district.trim()}` : '',
      addr.province?.trim() ? `จ.${addr.province.trim()}` : '',
      addr.postalCode?.trim() || '',
    ].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  return String(fallbackText || '').trim() || '-';
}

