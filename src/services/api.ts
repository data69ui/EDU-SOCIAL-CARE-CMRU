import * as XLSX from 'xlsx';
import type {
  AcademicYear,
  ApplicationStatus,
  BasicInfoData,
  GradeRecord,
  GoogleWorkspaceConfig,
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
  calculateApprovedVolunteerHours,
  formatReceivedScholarshipsText,
  getApplicationStatusMeta,
  sanitizeCsvCell,
} from '../utils/scholarshipLogic';

let inMemoryToken: string | null = null;

function getStoredToken(): string | null {
  return inMemoryToken;
}

function setStoredToken(token: string | null) {
  inMemoryToken = token;
}

async function request<T>(url: string, options?: RequestInit, attempt = 0): Promise<T> {
  const token = getStoredToken();
  const method = (options?.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(url, {
      credentials: 'include',
      signal: options?.signal ?? controller.signal,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (
      isIdempotent &&
      attempt === 0 &&
      (res.status === 502 || res.status === 503 || res.status === 504)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return request<T>(url, options, attempt + 1);
    }

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : {};
    if (!res.ok) {
      if (res.status === 401) {
        setStoredToken(null);
      }
      if (res.status === 413) {
        throw new Error('ขนาดไฟล์หรือข้อมูลใหญ่เกินขีดจำกัดของเซิร์ฟเวอร์ (แนะนำไม่เกิน 3 MB ต่อไฟล์)');
      }
      if (!isJson && res.status === 404) {
        throw new Error('ไม่พบ API ของระบบ กรุณาตรวจสอบการตั้งค่าเซิร์ฟเวอร์');
      }
      throw new Error(data.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
    if (!isJson) {
      throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า API');
    }
    return data as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('การเชื่อมต่อเซิร์ฟเวอร์ใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง');
    }
    if (isIdempotent && attempt === 0 && err instanceof TypeError) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return request<T>(url, options, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  getAuthStatus() {
    return request<{ adminInitialized: boolean; studentAuthMode?: string }>('/api/auth/status');
  },

  getPublicOverview(academicYear: AcademicYear | 'all' = 'all', yearLevel: YearLevel | 'all' = 'all') {
    const qs = new URLSearchParams({
      academicYear,
      yearLevel,
    }).toString();
    return request<{ overview: PublicOverviewStats }>(`/api/public/overview?${qs}`);
  },

  getMe() {
    return request<{ user: UserAccount | null }>('/api/auth/me');
  },

  async logout() {
    try {
      return await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  async deleteMyAccount() {
    try {
      return await request<{ ok: boolean }>('/api/auth/account', { method: 'DELETE' });
    } finally {
      setStoredToken(null);
    }
  },

  async setupFirstAdmin(payload: {
    username: string;
    password: string;
    confirmPassword?: string;
    fullName: string;
  }) {
    const res = await request<{ user: UserAccount; token?: string }>('/api/auth/admin/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async registerTeacher(payload: { username: string; password: string; fullName: string }) {
    const res = await request<{ user: UserAccount; token?: string }>('/api/auth/teacher/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async registerStudentById(payload: {
    studentId: string;
    fullName?: string;
    yearLevel?: YearLevel;
    academicYear?: AcademicYear;
  }) {
    const res = await request<{ user: UserAccount; token?: string }>('/api/auth/student/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async loginStudent(payload: { studentId: string; password: string }) {
    const res = await request<{ user: UserAccount; token?: string }>('/api/auth/student/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async loginPassword(payload: { role: UserRole; username: string; password: string }) {
    const res = await request<{ user: UserAccount; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async changePassword(payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const res = await request<{
      ok: boolean;
      message: string;
      user: UserAccount;
      token?: string;
    }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async uploadFile(file: File): Promise<UploadedFileMeta> {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
      reader.readAsDataURL(file);
    });

    const res = await request<{ file: UploadedFileMeta }>('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
      }),
    });
    return res.file;
  },

  // Student
  getMyStudentBundle() {
    return request<{ bundle: StudentFullRecord; teacherNames?: string[] }>('/api/student/me');
  },

  savePdpaDecision(consented: boolean) {
    return request<{ basicInfo: BasicInfoData }>('/api/student/pdpa', {
      method: 'PUT',
      body: JSON.stringify({ consented }),
    });
  },

  saveBasicInfo(basicInfo: BasicInfoData) {
    return request<{ basicInfo: BasicInfoData }>('/api/student/basic-info', {
      method: 'PUT',
      body: JSON.stringify(basicInfo),
    });
  },

  saveApplication(application: ScholarshipApplicationData, submitNow: boolean) {
    return request<{ application: ScholarshipApplicationData }>('/api/student/application', {
      method: 'PUT',
      body: JSON.stringify({ application, submitNow }),
    });
  },

  saveGradeRecord(payload: {
    academicYear: AcademicYear;
    yearLevel: YearLevel;
    semester: SemesterType;
    gpa: string;
    attachments: UploadedFileMeta[];
  }) {
    return request<{ grade: GradeRecord }>('/api/student/grades', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  submitVolunteer(payload: {
    academicYear: AcademicYear;
    activityTitle: string;
    activityDetail: string;
    learnings: string;
    hours: number;
    activityDate: string;
    dailyLifeApplication: string;
    photos: UploadedFileMeta[];
  }) {
    return request<{ volunteer: VolunteerRecord }>('/api/student/volunteers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Staff (Teacher + Admin)
  getAllStudents() {
    return request<{ students: StudentFullRecord[]; teacherNames?: string[] }>('/api/staff/students');
  },

  importStudentsExcel(rows: ImportedStudentRow[]) {
    return request<{ result: ImportStudentsResult }>('/api/staff/students/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  },

  createStudentRecord(row: ImportedStudentRow) {
    return request<{ result: ImportStudentsResult }>('/api/staff/students', {
      method: 'POST',
      body: JSON.stringify(row),
    });
  },

  reviewApplication(
    studentUserId: string,
    payload: { status: ApplicationStatus; advisorComment: string }
  ) {
    return request<{ application: ScholarshipApplicationData }>(
      `/api/staff/applications/${studentUserId}/review`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  reviewVolunteer(
    volunteerId: string,
    payload: {
      approvalStatus: 'approved' | 'rejected' | 'pending';
      approvedHours: number;
      advisorNote: string;
    }
  ) {
    return request<{ volunteer: VolunteerRecord }>(
      `/api/staff/volunteers/${volunteerId}/review`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  staffAttachGrade(
    studentUserId: string,
    payload: {
      academicYear: AcademicYear;
      yearLevel: YearLevel;
      semester: SemesterType;
      gpa: string;
      attachments: UploadedFileMeta[];
    }
  ) {
    return request<{ grade: GradeRecord }>(`/api/staff/grades/${studentUserId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Admin
  getAdminUsers() {
    return request<{ users: UserAccount[] }>('/api/admin/users');
  },

  resetUserPassword(
    userId: string,
    payload: string | { resetToDefault?: boolean; newPassword?: string }
  ) {
    const body = typeof payload === 'string' ? { newPassword: payload } : payload;
    return request<{ user: UserAccount; message?: string }>(`/api/admin/users/${userId}/password`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  adminCreateUser(payload: {
    role: UserRole;
    username: string;
    password?: string;
    fullName: string;
    studentId?: string;
  }) {
    return request<{ user: UserAccount }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  adminDeleteUser(userId: string) {
    return request<{ deletedUser: UserAccount }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },

  getWorkspaceConfig() {
    return request<{ config: GoogleWorkspaceConfig }>('/api/workspace/config');
  },

  saveWorkspaceConfig(config: GoogleWorkspaceConfig) {
    return request<{ config: GoogleWorkspaceConfig }>('/api/workspace/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  restoreSnapshot(payload: SystemSnapshotPayload) {
    return request<{ result: RestoreSnapshotResult }>('/api/admin/restore-snapshot', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAppsScriptTemplate() {
    return request<{ code: string }>('/api/admin/apps-script-template');
  },
};

export function exportStudentsToExcel(records: StudentFullRecord[], fileNamePrefix = 'cmru_scholarships') {
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

export function exportStudentsToCsv(records: StudentFullRecord[], fileNamePrefix = 'cmru_google_sheets') {
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
