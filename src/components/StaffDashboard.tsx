import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Code2,
  DatabaseBackup,
  Download,
  Eye,
  FileSpreadsheet,
  FileUp,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  LayoutDashboard,
  Loader2,
  PieChart,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  api,
  downloadStudentImportTemplateExcel,
  exportStudentsToCsv,
  exportStudentsToExcel,
} from '../services/api';
import type {
  AcademicYear,
  ApplicationStatus,
  ImportedStudentRow,
  ImportStudentsResult,
  SemesterType,
  StudentFullRecord,
  UploadedFileMeta,
  UserAccount,
  UserRole,
  YearLevel,
} from '../types/scholarship';
import {
  ACADEMIC_YEARS,
  YEAR_LEVELS,
  buildPublicOverviewStats,
  calculateApprovedVolunteerHours,
  canDeleteUserAccount,
  evaluateLoginAttemptStatus,
  filterStudentRecords,
  formatReceivedScholarshipsText,
  formatStructuredAddress,
  getApplicationStatusMeta,
  parseExcelStudentRows,
  resolveAdvisorDisplayName,
  sanitizeReceivedScholarships,
  validateStrongPassword,
  validateStudentId,
} from '../utils/scholarshipLogic';
import { DashboardShell, type SidebarNavGroup } from './DashboardShell';
import { DirectPrintModal } from './DirectPrintModal';
import { FileUploadField } from './FileUploadField';
import { ScholarshipSummarySection } from './ScholarshipSummarySection';
import { StudentProfilePrintView } from './StudentProfilePrintView';
import { exportElementToPdf, exportElementToPdfBlobUrl } from '../utils/pdfExport';
import { buildSummaryReportPdfFilename, type PdfOrientation } from '../utils/pdfHelpers';

export type StaffSectionKey =
  | 'home'
  | 'applications'
  | 'grades'
  | 'volunteers'
  | 'excel-import'
  | 'pdf-reports'
  | 'admin-users'
  | 'integrations';

interface StaffDashboardProps {
  currentUser: UserAccount;
  activeSection: StaffSectionKey;
  onSelectSection: (section: StaffSectionKey) => void;
  onLogout: () => void;
}

const SECTION_META: Record<StaffSectionKey, { title: string; breadcrumb: string }> = {
  home: { title: 'Dashboard', breadcrumb: 'ภาพรวมข้อมูลทุนการศึกษา & กยศ.' },
  applications: { title: 'รายชื่อขอทุน & พิจารณา', breadcrumb: 'ตรวจสอบคำร้องและอนุมัติทุน' },
  grades: { title: 'ข้อมูลพื้นฐาน & ผลการเรียน', breadcrumb: 'ประวัตินักศึกษาและแนบ GPA' },
  volunteers: { title: 'ตรวจสอบ & อนุมัติจิตอาสา', breadcrumb: 'รับรองชั่วโมงกิจกรรมอาสา' },
  'excel-import': { title: 'นำเข้าข้อมูล Excel / เพิ่มรายชื่อ', breadcrumb: 'อัปโหลดไฟล์ .xlsx / .csv หรือเพิ่มรายบุคคล' },
  'pdf-reports': { title: 'ศูนย์พิมพ์รายงาน PDF', breadcrumb: 'พิมพ์รายชื่อรวมและโปรไฟล์รายบุคคล' },
  'admin-users': { title: 'จัดการผู้ใช้งาน', breadcrumb: 'สร้างบัญชี แก้ไขรหัสผ่าน และลบบัญชี' },
  integrations: { title: 'Google Sheets & สำรองข้อมูล', breadcrumb: 'ส่งออกข้อมูลและเชื่อมต่อ Apps Script' },
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || 'ST';
}

export function StaffDashboard({
  currentUser,
  activeSection,
  onSelectSection,
  onLogout,
}: StaffDashboardProps) {
  const isAdmin = currentUser.role === 'admin';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [students, setStudents] = useState<StudentFullRecord[]>([]);
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);
  const [teacherNames, setTeacherNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hideOnboarding, setHideOnboarding] = useState(false);

  // Filters
  const [filterYear, setFilterYear] = useState<AcademicYear | 'all'>('all');
  const [filterLevel, setFilterLevel] = useState<YearLevel | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ApplicationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected student detail & review states
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ApplicationStatus>('approved');
  const [advisorComment, setAdvisorComment] = useState('');
  const [printStudent, setPrintStudent] = useState<StudentFullRecord | null>(null);
  const [downloadingSummaryPdf, setDownloadingSummaryPdf] = useState(false);
  const [preparingDirectPrint, setPreparingDirectPrint] = useState(false);
  const [directPrintData, setDirectPrintData] = useState<{
    blobUrl: string;
    filename: string;
    pageCount: number;
    orientation: PdfOrientation;
    pageImages: string[];
  } | null>(null);
  const [reportOrientation, setReportOrientation] = useState<PdfOrientation>('landscape');
  const reviewPanelRef = useRef<HTMLElement | null>(null);
  const reportSheetRef = useRef<HTMLElement | null>(null);

  // Staff attach grade states
  const [gradeTargetStudentId, setGradeTargetStudentId] = useState<string>('');
  const [gradeYear, setGradeYear] = useState<AcademicYear>('2569');
  const [gradeLevel, setGradeLevel] = useState<YearLevel>('ปี 1');
  const [gradeSemester, setGradeSemester] = useState<SemesterType>('ภาคเรียนที่ 1');
  const [gradeGpa, setGradeGpa] = useState('');
  const [gradeFiles, setGradeFiles] = useState<UploadedFileMeta[]>([]);

  // Excel import & Quick-Add student states
  const [excelFileName, setExcelFileName] = useState<string>('');
  const [parsedExcelRows, setParsedExcelRows] = useState<ImportedStudentRow[]>([]);
  const [parsedExcelErrors, setParsedExcelErrors] = useState<
    { rowNumber: number; message: string }[]
  >([]);
  const [importingExcel, setImportingExcel] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportStudentsResult | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  // Single quick-add student states
  const [quickStudentId, setQuickStudentId] = useState('');
  const [quickFullName, setQuickFullName] = useState('');
  const [quickEmail, setQuickEmail] = useState('');
  const [quickAcademicYear, setQuickAcademicYear] = useState<AcademicYear>('2569');
  const [quickYearLevel, setQuickYearLevel] = useState<YearLevel>('ปี 1');
  const [quickGpax, setQuickGpax] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickLoan, setQuickLoan] = useState<'กู้' | 'ไม่กู้'>('ไม่กู้');
  const [creatingSingleStudent, setCreatingSingleStudent] = useState(false);

  // Admin password reset, create user & delete user states
  const [resetTargetUser, setResetTargetUser] = useState<UserAccount | null>(null);
  const [resetMode, setResetMode] = useState<'default' | 'custom'>('default');
  const [deleteTargetUser, setDeleteTargetUser] = useState<UserAccount | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('student');
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [appsScriptCode, setAppsScriptCode] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAllStudents();
      setStudents(res.students);
      setTeacherNames(res.teacherNames || []);
      if (res.students.length > 0 && !res.students.some((s) => s.user.id === gradeTargetStudentId)) {
        setGradeTargetStudentId(res.students[0].user.id);
      } else if (res.students.length === 0) {
        setGradeTargetStudentId('');
      }
      if (isAdmin) {
        const usersRes = await api.getAdminUsers();
        setAllUsers(usersRes.users);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSummaryPdf = async () => {
    if (!reportSheetRef.current) return;
    setDownloadingSummaryPdf(true);
    setError(null);
    try {
      const filename = buildSummaryReportPdfFilename(filterYear, filterLevel);
      const res = await exportElementToPdf(reportSheetRef.current, filename, {
        orientation: reportOrientation,
        fitAllColumns: true,
      });
      setToast(
        `ดาวน์โหลดรายงาน ${res.filename} (${res.pageCount} หน้า · ${
          reportOrientation === 'landscape' ? 'A4 แนวนอน' : 'A4 แนวตั้ง'
        } · Fit All Columns) เรียบร้อยแล้ว`
      );
    } catch (err) {
      setError((err as Error).message || 'ไม่สามารถสร้างไฟล์ PDF ได้');
    } finally {
      setDownloadingSummaryPdf(false);
    }
  };

  const handleDirectPrintSummary = async () => {
    if (!reportSheetRef.current || preparingDirectPrint) return;
    setError(null);

    let nativePrintTriggered = false;
    const onBeforePrint = () => {
      nativePrintTriggered = true;
    };
    window.addEventListener('beforeprint', onBeforePrint, { once: true });

    const isEmbeddedFrame = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    try {
      window.print();
    } catch {
      // Blocked by sandboxed iframe
    }

    await new Promise((resolve) => setTimeout(resolve, isEmbeddedFrame ? 140 : 220));
    window.removeEventListener('beforeprint', onBeforePrint);

    if (nativePrintTriggered && !isEmbeddedFrame) {
      return;
    }

    setPreparingDirectPrint(true);
    try {
      const filename = buildSummaryReportPdfFilename(filterYear, filterLevel);
      const res = await exportElementToPdfBlobUrl(reportSheetRef.current, filename, {
        orientation: reportOrientation,
        fitAllColumns: true,
      });
      setDirectPrintData(res);
    } catch (err) {
      setError((err as Error).message || 'ไม่สามารถเปิดหน้าจอสั่งพิมพ์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setPreparingDirectPrint(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser.id]);

  useEffect(() => {
    if (activeSection === 'integrations' && !appsScriptCode) {
      api.getAppsScriptTemplate().then((r) => setAppsScriptCode(r.code)).catch(() => {});
    }
  }, [activeSection]);

  const filteredStudents = useMemo(
    () =>
      filterStudentRecords(students, {
        academicYear: filterYear,
        yearLevel: filterLevel,
        status: filterStatus,
        searchQuery,
      }),
    [students, filterYear, filterLevel, filterStatus, searchQuery]
  );

  const dashboardOverview = useMemo(
    () => buildPublicOverviewStats(students, filterYear, 'all'),
    [students, filterYear]
  );

  const stats = useMemo(() => {
    const total = dashboardOverview.filteredTotal;
    const approved = dashboardOverview.approvedCount;
    const pendingReview = dashboardOverview.pendingCount;
    const loanCount = dashboardOverview.loanCount;
    const pendingVol = students.reduce(
      (sum, s) => sum + s.volunteers.filter((v) => v.approvalStatus === 'pending').length,
      0
    );
    return { total, approved, pendingReview, loanCount, pendingVol };
  }, [dashboardOverview, students]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.user.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const openStudentReview = (rec: StudentFullRecord) => {
    setSelectedStudentId(rec.user.id);
    setReviewStatus(rec.application?.status || 'reviewing');
    setAdvisorComment(rec.application?.advisorComment || '');
    if (activeSection !== 'applications') {
      onSelectSection('applications');
    }
    setTimeout(() => {
      reviewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 90);
  };

  const handleSaveApplicationReview = async () => {
    if (!selectedStudent) return;
    try {
      await api.reviewApplication(selectedStudent.user.id, {
        status: reviewStatus,
        advisorComment,
      });
      setToast('บันทึกผลการพิจารณาทุนและความคิดเห็นอาจารย์เรียบร้อยแล้ว');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleReviewVolunteer = async (
    volunteerId: string,
    approvalStatus: 'approved' | 'rejected',
    hours: number
  ) => {
    try {
      await api.reviewVolunteer(volunteerId, {
        approvalStatus,
        approvedHours: approvalStatus === 'approved' ? hours : 0,
        advisorNote:
          approvalStatus === 'approved'
            ? `อนุมัติชั่วโมงจิตอาสา ${hours} ชั่วโมง โดย ${currentUser.fullName}`
            : `ไม่อนุมัติรายการจิตอาสา โดย ${currentUser.fullName}`,
      });
      setToast(
        approvalStatus === 'approved'
          ? `อนุมัติ ${hours} ชั่วโมงจิตอาสาเรียบร้อยแล้ว`
          : 'บันทึกการไม่อนุมัติรายการจิตอาสาแล้ว'
      );
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStaffAttachGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradeTargetStudentId || !gradeGpa.trim()) {
      setError('กรุณาเลือกนักศึกษาและกรอกเกรดเฉลี่ย');
      return;
    }
    try {
      await api.staffAttachGrade(gradeTargetStudentId, {
        academicYear: gradeYear,
        yearLevel: gradeLevel,
        semester: gradeSemester,
        gpa: gradeGpa.trim(),
        attachments: gradeFiles,
      });
      setGradeGpa('');
      setGradeFiles([]);
      setToast('อาจารย์/ผู้ดูแลระบบบันทึกผลการเรียนให้นักศึกษาเรียบร้อยแล้ว');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleExcelFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setImportSummary(null);
    setExcelFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setError('ไม่พบข้อมูลชีตในไฟล์ที่อัปโหลด');
        setParsedExcelRows([]);
        setParsedExcelErrors([]);
        return;
      }
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const parsed = parseExcelStudentRows(rawRows);
      setParsedExcelRows(parsed.validRows);
      setParsedExcelErrors(parsed.errors);
      if (parsed.validRows.length === 0 && parsed.errors.length === 0) {
        setError('ไฟล์ว่างเปล่าหรือไม่มีแถวรายชื่อนักศึกษา');
      }
    } catch {
      setError('ไม่สามารถอ่านไฟล์ Excel/CSV ได้ กรุณาตรวจสอบรูปแบบไฟล์');
    }
  };

  const handleCommitExcelImport = async () => {
    if (parsedExcelRows.length === 0) return;
    setImportingExcel(true);
    setError(null);
    try {
      const res = await api.importStudentsExcel(parsedExcelRows);
      setImportSummary(res.result);
      setToast(
        `นำเข้าข้อมูลสำเร็จ: เพิ่มใหม่ ${res.result.createdCount} คน, อัปเดต ${res.result.updatedCount} คน`
      );
      setParsedExcelRows([]);
      setParsedExcelErrors([]);
      setExcelFileName('');
      if (excelInputRef.current) excelInputRef.current.value = '';
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportingExcel(false);
    }
  };

  const handleQuickAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const idCheck = validateStudentId(quickStudentId);
    const trimmedName = quickFullName.trim();
    if (!idCheck.valid) {
      setError(idCheck.error || 'กรุณากรอกรหัสนักศึกษาให้ถูกต้อง');
      return;
    }
    if (!trimmedName) {
      setError('กรุณากรอกชื่อ-นามสกุลนักศึกษา');
      return;
    }
    const cleanEmail = quickEmail.trim().toLowerCase();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }
    setCreatingSingleStudent(true);
    try {
      const res = await api.createStudentRecord({
        studentId: idCheck.normalized,
        fullName: trimmedName,
        email: cleanEmail || undefined,
        academicYear: quickAcademicYear,
        yearLevel: quickYearLevel,
        gpax: quickGpax.trim() || undefined,
        phone: quickPhone.trim() || undefined,
        hasStudentLoan: quickLoan,
      });
      setToast(
        res.result.createdCount > 0
          ? `เพิ่มรายชื่อนักศึกษา ${trimmedName} (${idCheck.normalized}) เข้าสู่ระบบเรียบร้อยแล้ว`
          : `อัปเดตข้อมูลนักศึกษา ${trimmedName} (${idCheck.normalized}) เรียบร้อยแล้ว`
      );
      setQuickStudentId('');
      setQuickFullName('');
      setQuickEmail('');
      setQuickGpax('');
      setQuickPhone('');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingSingleStudent(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setError(null);
    const isStudentDefaultReset = resetTargetUser.role === 'student' && resetMode === 'default';
    if (!isStudentDefaultReset && resetTargetUser.role === 'student') {
      const check = validateStrongPassword(newPasswordInput);
      if (!check.valid) {
        setError(check.error || 'รหัสผ่านชั่วคราวไม่ผ่านเกณฑ์ความปลอดภัย');
        return;
      }
    }
    try {
      const res = await api.resetUserPassword(
        resetTargetUser.id,
        isStudentDefaultReset
          ? { resetToDefault: true }
          : { resetToDefault: false, newPassword: newPasswordInput }
      );
      setToast(
        res.message ||
          `รีเซ็ตรหัสผ่านของ ${resetTargetUser.fullName} (${resetTargetUser.username}) เรียบร้อยแล้ว`
      );
      setResetTargetUser(null);
      setNewPasswordInput('');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.adminCreateUser({
        role: newUserRole,
        username: newUsername.trim(),
        studentId: newUserRole === 'student' ? newUsername.trim() : undefined,
        password: newUserPassword.trim() || undefined,
        fullName: newFullName.trim(),
      });
      setToast(`สร้างบัญชี ${newFullName} (${newUsername}) เรียบร้อยแล้ว`);
      setNewUsername('');
      setNewFullName('');
      setNewUserPassword('');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteTargetUser) return;
    setDeletingUser(true);
    setError(null);
    try {
      await api.adminDeleteUser(deleteTargetUser.id);
      if (selectedStudentId === deleteTargetUser.id) setSelectedStudentId(null);
      if (gradeTargetStudentId === deleteTargetUser.id) setGradeTargetStudentId('');
      if (resetTargetUser?.id === deleteTargetUser.id) setResetTargetUser(null);
      setToast(
        `ลบบัญชีผู้ใช้ ${deleteTargetUser.fullName} (${deleteTargetUser.username}) เรียบร้อยแล้ว`
      );
      setDeleteTargetUser(null);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingUser(false);
    }
  };

  const handleDownloadJsonBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser.username,
      totalStudents: students.length,
      students,
      users: allUsers,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cmru_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navGroups: SidebarNavGroup[] = [
    {
      title: 'งานทุนการศึกษา',
      items: [
        { key: 'home', label: 'ภาพรวม (Dashboard)', icon: LayoutDashboard },
        {
          key: 'applications',
          label: 'รายชื่อขอทุน & พิจารณา',
          icon: Users,
          badge: stats.pendingReview > 0 ? stats.pendingReview : undefined,
        },
        { key: 'grades', label: 'ข้อมูลพื้นฐาน & ผลการเรียน', icon: GraduationCap },
        {
          key: 'volunteers',
          label: 'ตรวจสอบ & อนุมัติจิตอาสา',
          icon: HeartHandshake,
          badge: stats.pendingVol > 0 ? stats.pendingVol : undefined,
        },
      ],
    },
    {
      title: 'นำเข้าข้อมูล & รายงาน',
      items: [
        { key: 'excel-import', label: 'นำเข้า Excel / เพิ่มรายชื่อ', icon: FileSpreadsheet },
        { key: 'pdf-reports', label: 'พิมพ์รายงาน PDF', icon: Printer },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: 'การจัดการผู้ดูแลระบบ',
            items: [
              { key: 'admin-users', label: 'จัดการผู้ใช้งาน & รหัสผ่าน', icon: KeyRound },
              { key: 'integrations', label: 'Google Sheets & สำรองข้อมูล', icon: Code2 },
            ],
          },
        ]
      : []),
  ];

  // Donut Chart geometry
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const totalForDonut = Math.max(1, dashboardOverview.filteredTotal);
  const draftCount =
    dashboardOverview.draftOrNoAppCount + dashboardOverview.needsRevisionOrRejectedCount;
  const donutSegments = [
    { label: 'อนุมัติทุนแล้ว', count: dashboardOverview.approvedCount, color: '#16A34A' },
    { label: 'รอพิจารณา', count: dashboardOverview.pendingCount, color: '#D97706' },
    { label: 'ฉบับร่าง / ขอแก้ไข', count: draftCount, color: '#CBD5E1' },
  ];
  let cumulative = 0;
  const donutArcs = donutSegments.map((seg) => {
    const frac = dashboardOverview.filteredTotal > 0 ? seg.count / totalForDonut : 0;
    const len = frac * circumference;
    const offset = -cumulative;
    cumulative += len;
    return {
      ...seg,
      pct: Math.round(frac * 100),
      strokeDasharray: `${len} ${circumference}`,
      strokeDashoffset: offset,
    };
  });

  const maxBucketTotal = Math.max(
    1,
    ...dashboardOverview.byYearLevel.map((b) => Math.max(b.total, 1))
  );

  const kpiCards = [
    {
      title: 'นักศึกษาทั้งหมด',
      value: `${stats.total.toLocaleString()} คน`,
      meta: `ยืนยัน PDPA แล้ว ${dashboardOverview.pdpaConsentedCount} คน`,
      iconBg: 'bg-[#EFF6FF] text-[#1D4ED8]',
      icon: Users,
    },
    {
      title: 'อนุมัติทุนแล้ว',
      value: `${stats.approved.toLocaleString()} คน`,
      meta: `คิดเป็น ${stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}% ของนักศึกษาทั้งหมด`,
      iconBg: 'bg-[#ECFDF5] text-[#15803D]',
      icon: UserCheck,
    },
    {
      title: 'รอพิจารณาทุน / จิตอาสา',
      value: `${stats.pendingReview.toLocaleString()} รายการ`,
      meta: `จิตอาสารออนุมัติ ${stats.pendingVol} รายการ`,
      iconBg: 'bg-[#FFFBEB] text-[#B45309]',
      icon: Clock,
    },
    {
      title: 'กู้ยืม กยศ. / GPAX เฉลี่ย',
      value: `${stats.loanCount.toLocaleString()} คน`,
      meta: `เกรดเฉลี่ยรวม ${dashboardOverview.averageGpax}`,
      iconBg: 'bg-[#F8ECED] text-[#7A1629]',
      icon: Wallet,
    },
  ];

  const meta = SECTION_META[activeSection];

  return (
    <DashboardShell
      user={currentUser}
      pageTitle={meta.title}
      breadcrumb={meta.breadcrumb}
      activeNavKey={activeSection}
      navGroups={navGroups}
      onSelectNav={(key) => onSelectSection(key as StaffSectionKey)}
      onGoHome={() => onSelectSection('home')}
      onLogout={onLogout}
      mobileMenuOpen={mobileMenuOpen}
      onSetMobileMenuOpen={setMobileMenuOpen}
      topRightSlot={
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="staff-top-year" className="sr-only">
            กรองปีการศึกษา
          </label>
          <select
            id="staff-top-year"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value as AcademicYear | 'all')}
            className="rounded-xl border border-[#DFD1BA] bg-[#FAF6EE] px-3 py-1.5 text-xs font-medium text-[#23181A]"
          >
            <option value="all">ทุกปีการศึกษา ({students.length} คน)</option>
            {ACADEMIC_YEARS.map((y) => (
              <option key={y} value={y}>
                ปีการศึกษา {y}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onSelectSection('pdf-reports')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] bg-white px-3 py-1.5 text-xs font-semibold text-[#7A1629] hover:bg-[#FAF6EE] transition-colors whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">พิมพ์ PDF</span>
          </button>

          <button
            type="button"
            onClick={() => exportStudentsToExcel(filteredStudents)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#166534] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#14532D] transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">ส่งออก Excel</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            className="no-print flex items-center justify-between rounded-xl border border-[#86EFAC] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]"
          >
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs font-medium underline"
            >
              ปิด
            </button>
          </motion.div>
        )}

        {error && (
          <div
            role="alert"
            className="no-print flex items-center justify-between rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-medium underline"
            >
              ปิด
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* SECTION 0: Executive Dashboard Home (Matching Reference Image Layout) */}
            {activeSection === 'home' && (
              <div className="no-print space-y-6">
                {isAdmin && !loading && students.length === 0 && !hideOnboarding && (
                  <section
                    aria-label="เริ่มต้นใช้งานสำหรับผู้ดูแลระบบครั้งแรก"
                    className="rounded-2xl border border-[#C6922C]/70 bg-gradient-to-br from-[#FFFDF9] via-white to-[#FDF6E4] p-5 sm:p-6 space-y-4 surface-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7A1629] text-[#F5D98E]">
                          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <h2 className="font-display text-base sm:text-lg font-bold text-[#7A1629]">
                            ยินดีต้อนรับผู้ดูแลระบบ — เริ่มต้นใช้งานระบบ 3 ขั้นตอน
                          </h2>
                          <p className="text-xs sm:text-sm text-[#5A4B4E]">
                            ระบบพร้อมใช้งานจริงแล้ว สามารถเพิ่มรายชื่อนักศึกษาจาก Excel หรือจัดการบัญชีผู้ใช้งานได้ทันที
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHideOnboarding(true)}
                        className="text-xs font-medium text-[#66585B] hover:text-[#7A1629] underline"
                      >
                        ซ่อนคำแนะนำ
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectSection('excel-import')}
                        className="rounded-xl border border-[#DFD1BA] bg-white p-4 text-left hover:border-[#7A1629] hover:shadow-xs transition-all space-y-1.5"
                      >
                        <div className="flex items-center gap-2 text-xs font-bold text-[#7A1629]">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#7A1629] text-[11px] text-white">
                            1
                          </span>
                          <span>นำเข้าจาก Excel / เพิ่มนักศึกษา</span>
                        </div>
                        <p className="text-xs text-[#5A4B4E] leading-relaxed">
                          ระบบสร้างรหัสผ่านเริ่มต้น (รหัสนักศึกษา 8 หลัก) และบังคับเปลี่ยนรหัสครั้งแรกให้อัตโนมัติ
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectSection('admin-users')}
                        className="rounded-xl border border-[#DFD1BA] bg-white p-4 text-left hover:border-[#7A1629] hover:shadow-xs transition-all space-y-1.5"
                      >
                        <div className="flex items-center gap-2 text-xs font-bold text-[#7A1629]">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#C6922C] text-[11px] text-white">
                            2
                          </span>
                          <span>เพิ่มบัญชีอาจารย์ &amp; จัดการผู้ใช้</span>
                        </div>
                        <p className="text-xs text-[#5A4B4E] leading-relaxed">
                          สร้างบัญชีอาจารย์ประจำสาขา ผู้ดูแลระบบเพิ่มเติม และรีเซ็ตรหัสผ่านได้ตลอดเวลา
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectSection('integrations')}
                        className="rounded-xl border border-[#DFD1BA] bg-white p-4 text-left hover:border-[#7A1629] hover:shadow-xs transition-all space-y-1.5"
                      >
                        <div className="flex items-center gap-2 text-xs font-bold text-[#7A1629]">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#15803D] text-[11px] text-white">
                            3
                          </span>
                          <span>เชื่อม Google Sheets &amp; สำรองข้อมูล</span>
                        </div>
                        <p className="text-xs text-[#5A4B4E] leading-relaxed">
                          ดาวน์โหลดเทมเพลต คัดลอก Apps Script และสำรองฐานข้อมูล (JSON / Excel / PDF)
                        </p>
                      </button>
                    </div>
                  </section>
                )}

                {/* Row 1: 4 KPI Cards */}
                <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {kpiCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={card.title}
                        className="rounded-2xl border border-[#DFD1BA] bg-white p-5 flex items-start gap-4 surface-card transition-transform duration-200 hover:-translate-y-0.5"
                      >
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${card.iconBg}`}
                        >
                          <Icon className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs font-medium text-[#66585B]">{card.title}</p>
                          <p className="font-display text-2xl font-bold text-[#23181A] tabular-nums">
                            {loading ? '—' : card.value}
                          </p>
                          <p className="text-xs text-[#66585B] leading-snug">{card.meta}</p>
                        </div>
                      </div>
                    );
                  })}
                </section>

                {/* Row 2: Bar Chart (5) + Donut Chart (4) + Recent Students (3) */}
                <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                  {/* Bar Chart: Year Level */}
                  <div className="xl:col-span-5 rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[#7A1629]">
                        <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <h2 className="font-display text-sm sm:text-base font-bold text-[#23181A]">
                          กราฟจำนวนนักศึกษาแยกตามชั้นปี
                        </h2>
                      </div>
                      <span className="text-xs text-[#66585B]">คลิกเพื่อดูรายชื่อ</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#5A4B4E]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-xs bg-[#16A34A]" />
                        <span>อนุมัติแล้ว</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-xs bg-[#D97706]" />
                        <span>รอพิจารณา</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-xs bg-[#CBD5E1]" />
                        <span>ฉบับร่าง</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-3 items-end h-48 border-b border-[#E6DAC5] pt-4 px-2">
                      {dashboardOverview.byYearLevel.map((bucket) => {
                        const heightPct = Math.round((bucket.total / maxBucketTotal) * 100);
                        const approvedPct =
                          bucket.total > 0
                            ? Math.round((bucket.approved / bucket.total) * 100)
                            : 0;
                        const pendingPct =
                          bucket.total > 0
                            ? Math.round((bucket.pending / bucket.total) * 100)
                            : 0;
                        return (
                          <button
                            key={bucket.yearLevel}
                            type="button"
                            onClick={() => {
                              setFilterLevel(bucket.yearLevel);
                              onSelectSection('applications');
                            }}
                            className="group flex flex-col items-center justify-end h-full gap-1.5 rounded-lg"
                          >
                            <span className="text-xs font-semibold text-[#23181A] tabular-nums">
                              {bucket.total}
                            </span>
                            <div className="w-full max-w-[44px] h-32 flex items-end justify-center">
                              {bucket.total > 0 ? (
                                <div
                                  style={{ height: `${Math.max(heightPct, 15)}%` }}
                                  className="w-full rounded-t-lg overflow-hidden flex flex-col-reverse transition-transform group-hover:scale-[1.04]"
                                >
                                  {bucket.approved > 0 && (
                                    <div
                                      style={{ height: `${approvedPct}%` }}
                                      className="w-full bg-[#16A34A]"
                                    />
                                  )}
                                  {bucket.pending > 0 && (
                                    <div
                                      style={{ height: `${pendingPct}%` }}
                                      className="w-full bg-[#D97706]"
                                    />
                                  )}
                                  {bucket.draft > 0 && (
                                    <div className="w-full flex-1 bg-[#CBD5E1]" />
                                  )}
                                </div>
                              ) : (
                                <div className="w-full h-1.5 rounded-t bg-[#EFE5D4]" />
                              )}
                            </div>
                            <span className="pb-2 text-xs font-medium text-[#5A4B4E]">
                              {bucket.yearLevel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Donut Chart: Status Distribution */}
                  <div className="xl:col-span-4 rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card">
                    <div className="flex items-center gap-2 text-[#7A1629]">
                      <PieChart className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <h2 className="font-display text-sm sm:text-base font-bold text-[#23181A]">
                        จำนวนนักศึกษาแยกตามสถานะทุน
                      </h2>
                    </div>

                    <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-4 pt-2">
                      <div className="relative h-36 w-36 shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
                          <circle
                            cx="66"
                            cy="66"
                            r={radius}
                            fill="transparent"
                            stroke="#F2E9D8"
                            strokeWidth="18"
                          />
                          {dashboardOverview.filteredTotal > 0 &&
                            donutArcs.map(
                              (arc) =>
                                arc.count > 0 && (
                                  <circle
                                    key={arc.label}
                                    cx="66"
                                    cy="66"
                                    r={radius}
                                    fill="transparent"
                                    stroke={arc.color}
                                    strokeWidth="18"
                                    strokeDasharray={arc.strokeDasharray}
                                    strokeDashoffset={arc.strokeDashoffset}
                                  />
                                )
                            )}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="font-display text-2xl font-bold text-[#23181A] tabular-nums">
                            {dashboardOverview.filteredTotal}
                          </span>
                          <span className="text-[11px] text-[#66585B]">คน</span>
                        </div>
                      </div>

                      <div className="w-full space-y-3">
                        {donutArcs.map((arc) => (
                          <div key={arc.label} className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-2 text-[#4B3F42]">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: arc.color }}
                              />
                              <span>{arc.label}</span>
                            </span>
                            <span className="font-semibold text-[#23181A] tabular-nums">
                              {arc.count} คน ({arc.pct}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Recent Students List Card */}
                  <div className="xl:col-span-3 rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 flex flex-col justify-between gap-4 surface-card">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-display text-sm sm:text-base font-bold text-[#23181A]">
                          รายชื่อนักศึกษาล่าสุด
                        </h2>
                        <button
                          type="button"
                          onClick={() => onSelectSection('applications')}
                          className="text-xs font-medium text-[#7A1629] hover:underline"
                        >
                          ดูทั้งหมด
                        </button>
                      </div>

                      {students.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#DFD1BA] bg-[#FAF6EE]/70 p-4 text-center space-y-2.5">
                          <p className="text-xs text-[#66585B]">
                            ยังไม่มีรายชื่อนักศึกษาในระบบ
                          </p>
                          <button
                            type="button"
                            onClick={() => onSelectSection('excel-import')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7A1629] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5B0F1D]"
                          >
                            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>นำเข้าจาก Excel</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {students.slice(0, 5).map((rec) => (
                            <button
                              key={rec.user.id}
                              type="button"
                              onClick={() => openStudentReview(rec)}
                              className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-[#FAF6EE] transition-colors"
                            >
                              {rec.basicInfo.profilePhoto?.url ? (
                                <img
                                  src={rec.basicInfo.profilePhoto.url}
                                  alt={rec.basicInfo.fullName || rec.user.fullName}
                                  referrerPolicy="no-referrer"
                                  className="h-9 w-9 shrink-0 rounded-full object-cover border border-[#DFD1BA]"
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F8ECED] font-display text-xs font-bold text-[#7A1629]">
                                  {getInitials(rec.basicInfo.fullName || rec.user.fullName)}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-[#23181A]">
                                  {rec.basicInfo.fullName || rec.user.fullName}
                                </p>
                                <p className="truncate text-[11px] text-[#66585B] tabular-nums">
                                  {rec.basicInfo.studentId || rec.user.studentId || '-'} ·{' '}
                                  {rec.basicInfo.yearLevel}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Row 3: Compact Roster Table (8 cols) + 6-Tile Quick Actions (4 cols) */}
                <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                  <div className="xl:col-span-8 rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-display text-base font-bold text-[#23181A]">
                        ข้อมูลนักศึกษาล่าสุด
                      </h2>
                      <button
                        type="button"
                        onClick={() => onSelectSection('applications')}
                        className="text-xs font-medium text-[#7A1629] hover:underline"
                      >
                        ดูทั้งหมด ({filteredStudents.length} คน)
                      </button>
                    </div>

                    {filteredStudents.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#DFD1BA] bg-[#FAF6EE]/60 p-8 text-center space-y-3">
                        <p className="text-sm text-[#66585B]">
                          ยังไม่มีรายชื่อนักศึกษาในระบบสำหรับตัวกรองที่เลือก
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectSection('excel-import')}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5B0F1D]"
                          >
                            <FileUp className="h-4 w-4" aria-hidden="true" />
                            <span>นำเข้าข้อมูล Excel / เพิ่มรายชื่อ</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs sm:text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-[#EAE0CE] text-xs text-[#66585B]">
                              <th className="py-2.5 pr-3 font-semibold">รหัสนักศึกษา</th>
                              <th className="py-2.5 pr-3 font-semibold">ชื่อ-นามสกุล</th>
                              <th className="py-2.5 pr-3 font-semibold">ชั้นปี</th>
                              <th className="py-2.5 pr-3 font-semibold">GPAX</th>
                              <th className="py-2.5 pr-3 font-semibold">สถานะทุน</th>
                              <th className="py-2.5 text-right font-semibold">จัดการ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0E8D8]">
                            {filteredStudents.slice(0, 6).map((rec) => {
                              const statusMeta = getApplicationStatusMeta(rec.application?.status);
                              return (
                                <tr key={rec.user.id} className="hover:bg-[#FAF6EE]/70">
                                  <td className="py-3 pr-3 tabular-nums font-medium">
                                    {rec.basicInfo.studentId || rec.user.studentId || '-'}
                                  </td>
                                  <td className="py-3 pr-3 font-medium text-[#23181A]">
                                    {rec.basicInfo.fullName || rec.user.fullName}
                                  </td>
                                  <td className="py-3 pr-3">{rec.basicInfo.yearLevel}</td>
                                  <td className="py-3 pr-3 tabular-nums font-semibold text-[#7A1629]">
                                    {rec.application?.gpax || rec.basicInfo.gpax || '-'}
                                  </td>
                                  <td className="py-3 pr-3 text-xs font-medium">
                                    {statusMeta.label}
                                  </td>
                                  <td className="py-3 text-right">
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => openStudentReview(rec)}
                                        aria-label={`ดูโปรไฟล์ ${rec.basicInfo.fullName || rec.user.fullName}`}
                                        className="rounded-lg border border-[#DFD1BA] bg-white p-1.5 text-[#7A1629] hover:bg-[#FAF6EE]"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setPrintStudent(rec)}
                                        aria-label={`พิมพ์ PDF ${rec.basicInfo.fullName || rec.user.fullName}`}
                                        className="rounded-lg border border-[#DFD1BA] bg-white p-1.5 text-[#23181A] hover:bg-[#FAF6EE]"
                                      >
                                        <Printer className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 6-Tile Quick Actions (Matching Reference Image Bottom-Right Grid) */}
                  <div className="xl:col-span-4 rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card">
                    <h2 className="font-display text-base font-bold text-[#23181A]">เมนูด่วน</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectSection('excel-import')}
                        className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-3.5 flex flex-col items-center justify-center gap-2 text-center hover:border-[#7A1629] hover:bg-white transition-all"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#1D4ED8]">
                          <UserPlus className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="text-xs font-semibold text-[#23181A]">เพิ่มนักศึกษา</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectSection('applications')}
                        className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-3.5 flex flex-col items-center justify-center gap-2 text-center hover:border-[#7A1629] hover:bg-white transition-all"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#15803D]">
                          <Search className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="text-xs font-semibold text-[#23181A]">ค้นหา &amp; พิจารณา</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectSection('excel-import')}
                        className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-3.5 flex flex-col items-center justify-center gap-2 text-center hover:border-[#7A1629] hover:bg-white transition-all"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#166534]">
                          <FileUp className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="text-xs font-semibold text-[#23181A]">นำเข้า Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectSection('pdf-reports')}
                        className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-3.5 flex flex-col items-center justify-center gap-2 text-center hover:border-[#7A1629] hover:bg-white transition-all"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5F3FF] text-[#6D28D9]">
                          <Printer className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="text-xs font-semibold text-[#23181A]">พิมพ์รายงาน PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportStudentsToExcel(filteredStudents)}
                        className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-3.5 flex flex-col items-center justify-center gap-2 text-center hover:border-[#7A1629] hover:bg-white transition-all"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFFBEB] text-[#B45309]">
                          <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="text-xs font-semibold text-[#23181A]">ส่งออก Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onSelectSection(isAdmin ? 'admin-users' : 'volunteers')
                        }
                        className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-3.5 flex flex-col items-center justify-center gap-2 text-center hover:border-[#7A1629] hover:bg-white transition-all"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F8ECED] text-[#7A1629]">
                          {isAdmin ? (
                            <KeyRound className="h-5 w-5" aria-hidden="true" />
                          ) : (
                            <HeartHandshake className="h-5 w-5" aria-hidden="true" />
                          )}
                        </div>
                        <span className="text-xs font-semibold text-[#23181A]">
                          {isAdmin ? 'จัดการผู้ใช้' : 'ตรวจจิตอาสา'}
                        </span>
                      </button>
                    </div>
                  </div>
                </section>

                {/* Row 4: Automatic Scholarship Recipients Summary Window */}
                <ScholarshipSummarySection
                  summary={dashboardOverview.scholarshipSummary}
                  loading={loading}
                  onSelectRecipientUser={(studentUserId) => {
                    const target = students.find((s) => s.user.id === studentUserId);
                    if (target) {
                      openStudentReview(target);
                    }
                  }}
                />
              </div>
            )}

            {/* SECTION 1: Scholarship Applications Roster & Review */}
            {activeSection === 'applications' && (
              <div className="space-y-6">
                <section className="no-print rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="font-display text-lg font-bold text-[#7A1629]">
                      รายชื่อขอทุนการศึกษา ({filteredStudents.length} คน)
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectSection('excel-import')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#C6922C] bg-[#FDF8EC] px-3.5 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#F7EBCB] transition-colors"
                      >
                        <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>นำเข้าจาก Excel</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSection('pdf-reports')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] bg-white px-3.5 py-2 text-xs font-medium text-[#7A1629] hover:bg-[#FAF6EE] transition-colors"
                      >
                        <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>ดาวน์โหลด / พิมพ์ PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => exportStudentsToExcel(filteredStudents)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#166534] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#14532D] transition-colors"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>ส่งออก Excel (.xlsx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => exportStudentsToCsv(filteredStudents)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3.5 py-2 text-xs font-medium text-[#23181A] hover:bg-[#EFE5D1] transition-colors"
                      >
                        <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>CSV</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label htmlFor="flt-year" className="block text-xs font-medium text-[#66585B] mb-1">
                        ปีการศึกษา
                      </label>
                      <select
                        id="flt-year"
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value as AcademicYear | 'all')}
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      >
                        <option value="all">ทุกปีการศึกษา</option>
                        {ACADEMIC_YEARS.map((y) => (
                          <option key={y} value={y}>
                            ปีการศึกษา {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="flt-level" className="block text-xs font-medium text-[#66585B] mb-1">
                        ชั้นปี
                      </label>
                      <select
                        id="flt-level"
                        value={filterLevel}
                        onChange={(e) => setFilterLevel(e.target.value as YearLevel | 'all')}
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      >
                        <option value="all">ทุกชั้นปี</option>
                        {YEAR_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="flt-status" className="block text-xs font-medium text-[#66585B] mb-1">
                        สถานะการสมัคร
                      </label>
                      <select
                        id="flt-status"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as ApplicationStatus | 'all')}
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      >
                        <option value="all">ทุกสถานะ</option>
                        <option value="submitted">ยื่นใบสมัครแล้ว</option>
                        <option value="reviewing">กำลังพิจารณา</option>
                        <option value="approved">อนุมัติทุนการศึกษา</option>
                        <option value="needs_revision">ขอข้อมูลเพิ่มเติม</option>
                        <option value="rejected">ไม่ผ่านการพิจารณา</option>
                        <option value="draft">ฉบับร่าง</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="flt-q" className="block text-xs font-medium text-[#66585B] mb-1">
                        ค้นหาชื่อ / รหัสนักศึกษา
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#66585B]" aria-hidden="true" />
                        <input
                          id="flt-q"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="รหัส หรือ ชื่อนักศึกษา"
                          className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] pl-9 pr-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Roster Table */}
                <section className="rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 surface-card">
                  <div className="hidden print:block mb-4 border-b-2 border-[#7A1629] pb-3">
                    <h2 className="font-display text-lg font-bold text-[#7A1629]">
                      รายชื่อนักศึกษาผู้ขอรับทุนการศึกษา — สาขาวิชาสังคมศึกษา มหาวิทยาลัยราชภัฏเชียงใหม่
                    </h2>
                    <p className="text-xs text-[#4B5563]">
                      ปีการศึกษา: {filterYear === 'all' ? 'ทั้งหมด' : filterYear} · ชั้นปี:{' '}
                      {filterLevel === 'all' ? 'ทั้งหมด' : filterLevel} · จำนวน{' '}
                      {filteredStudents.length} คน
                    </p>
                  </div>

                  {loading ? (
                    <p className="py-8 text-center text-sm text-[#66585B]">กำลังโหลดข้อมูลนักศึกษา...</p>
                  ) : filteredStudents.length === 0 ? (
                    <div className="py-10 text-center space-y-3">
                      <p className="text-sm text-[#66585B]">
                        ไม่พบรายชื่อนักศึกษาตามเงื่อนไขที่เลือก
                      </p>
                      <button
                        type="button"
                        onClick={() => onSelectSection('excel-import')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5B0F1D]"
                      >
                        <FileUp className="h-4 w-4" aria-hidden="true" />
                        <span>นำเข้าข้อมูลนักศึกษาจาก Excel</span>
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-[#EAE0CE] text-xs text-[#66585B]">
                            <th className="py-3 pr-3 font-semibold">รหัสนักศึกษา</th>
                            <th className="py-3 pr-3 font-semibold">ชื่อ-นามสกุล</th>
                            <th className="py-3 pr-3 font-semibold">ปีการศึกษา</th>
                            <th className="py-3 pr-3 font-semibold">ชั้นปี</th>
                            <th className="py-3 pr-3 font-semibold">GPAX</th>
                            <th className="py-3 pr-3 font-semibold">สถานะทุน</th>
                            <th className="py-3 pr-3 font-semibold">จิตอาสา</th>
                            <th className="no-print py-3 font-semibold text-right">จัดการ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0E8D8]">
                          {filteredStudents.map((rec) => {
                            const statusMeta = getApplicationStatusMeta(rec.application?.status);
                            const vol = calculateApprovedVolunteerHours(rec.volunteers);
                            const isSelected = selectedStudentId === rec.user.id;
                            return (
                              <tr
                                key={rec.user.id}
                                className={`transition-colors ${
                                  isSelected ? 'bg-[#FDF8EC]' : 'hover:bg-[#FAF6EE]/80'
                                }`}
                              >
                                <td className="py-3.5 pr-3 tabular-nums font-medium">
                                  {rec.basicInfo.studentId || rec.user.studentId || '-'}
                                </td>
                                <td className="py-3.5 pr-3 font-medium text-[#23181A]">
                                  {rec.basicInfo.fullName || rec.user.fullName}
                                </td>
                                <td className="py-3.5 pr-3 tabular-nums">
                                  {rec.application?.academicYear || rec.basicInfo.academicYear}
                                </td>
                                <td className="py-3.5 pr-3">
                                  {rec.application?.yearLevel || rec.basicInfo.yearLevel}
                                </td>
                                <td className="py-3.5 pr-3 tabular-nums font-semibold text-[#7A1629]">
                                  {rec.application?.gpax || rec.basicInfo.gpax || '-'}
                                </td>
                                <td className="py-3.5 pr-3 text-xs font-medium">
                                  {statusMeta.label}
                                </td>
                                <td className="py-3.5 pr-3 tabular-nums text-xs">
                                  {vol.approvedHours} ชม. (รอ {vol.pendingHours} ชม.)
                                </td>
                                <td className="no-print py-3.5 text-right">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openStudentReview(rec)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-[#7A1629] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5B0F1D] transition-colors"
                                    >
                                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>ดูโปรไฟล์ / พิจารณา</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPrintStudent(rec)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#D8CBB8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#23181A] hover:bg-[#FAF6EE] transition-colors"
                                    >
                                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>PDF</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Detailed Student Review Panel */}
                <AnimatePresence>
                  {selectedStudent && (
                    <motion.section
                      ref={reviewPanelRef}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="no-print rounded-2xl border-2 border-[#C6922C] bg-white p-6 space-y-6 surface-elevated"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EAE0CE] pb-4">
                        <div className="flex items-center gap-4">
                          {selectedStudent.basicInfo.profilePhoto && (
                            <img
                              src={selectedStudent.basicInfo.profilePhoto.url}
                              alt="รูปประจำตัวนักศึกษา"
                              referrerPolicy="no-referrer"
                              className="h-20 w-16 rounded-xl border border-[#D8C6A6] object-cover"
                            />
                          )}
                          <div>
                            <h3 className="font-display text-xl font-bold text-[#7A1629]">
                              รายละเอียดโปรไฟล์:{' '}
                              {selectedStudent.basicInfo.fullName || selectedStudent.user.fullName}
                            </h3>
                            <p className="text-sm text-[#66585B] tabular-nums">
                              รหัสนักศึกษา {selectedStudent.basicInfo.studentId || '-'} ·{' '}
                              {selectedStudent.basicInfo.yearLevel} · GPAX{' '}
                              {selectedStudent.basicInfo.gpax || '-'} · โทร{' '}
                              {selectedStudent.basicInfo.phone || '-'}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPrintStudent(selectedStudent)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] px-3.5 py-2 text-xs font-medium text-[#7A1629] hover:bg-[#FAF6EE]"
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>พิมพ์ PDF โปรไฟล์นี้</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedStudentId(null)}
                            className="rounded-xl border border-[#D8CBB8] px-3 py-2 text-xs text-[#66585B] hover:bg-[#FAF6EE]"
                          >
                            ปิดรายละเอียด
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                        <div className="space-y-2.5 rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/70 p-5">
                          <h4 className="font-display font-bold text-[#7A1629]">
                            ข้อมูลครอบครัว ทุนการศึกษา และความจำเป็นทั้งหมด
                          </h4>
                          <p>
                            <strong>ที่อยู่ปัจจุบัน:</strong>{' '}
                            {formatStructuredAddress(
                              selectedStudent.application?.currentAddress,
                              selectedStudent.basicInfo.currentAddress
                            )}
                          </p>
                          <p>
                            <strong>บิดา:</strong> {selectedStudent.basicInfo.father.fullName || '-'} ·{' '}
                            {selectedStudent.basicInfo.father.occupation || '-'} (
                            {selectedStudent.basicInfo.father.monthlyIncome || '0'} บ./ด.)
                          </p>
                          <p>
                            <strong>มารดา:</strong> {selectedStudent.basicInfo.mother.fullName || '-'} ·{' '}
                            {selectedStudent.basicInfo.mother.occupation || '-'} (
                            {selectedStudent.basicInfo.mother.monthlyIncome || '0'} บ./ด.)
                          </p>
                          {(selectedStudent.application?.guardian?.fullName ||
                            selectedStudent.basicInfo.guardian?.fullName) && (
                            <p>
                              <strong>ผู้ปกครอง:</strong>{' '}
                              {selectedStudent.application?.guardian?.fullName ||
                                selectedStudent.basicInfo.guardian?.fullName}{' '}
                              (
                              {selectedStudent.application?.guardian?.relationship ||
                                selectedStudent.basicInfo.guardian?.relationship ||
                                'ผู้ดูแล'}
                              ) · รายได้{' '}
                              {selectedStudent.application?.guardian?.monthlyIncome ||
                                selectedStudent.basicInfo.guardian?.monthlyIncome ||
                                '0'}{' '}
                              บ./ด.
                            </p>
                          )}
                          <p>
                            <strong>กยศ. / ค่าใช้จ่ายต่อเดือน:</strong>{' '}
                            {selectedStudent.basicInfo.hasStudentLoan}{' '}
                            {selectedStudent.basicInfo.studentLoanYear} ·{' '}
                            {selectedStudent.application?.monthlyExpenses ||
                              selectedStudent.basicInfo.monthlyAllowance ||
                              '-'}{' '}
                            บ./ด.
                          </p>
                          <div className="rounded-lg border border-[#EAE0CE] bg-white px-3 py-2 space-y-1 text-xs">
                            <p className="font-semibold text-[#7A1629]">
                              ทุนการศึกษาที่ได้รับทั้งหมด:
                            </p>
                            {selectedStudent.basicInfo.hasOtherScholarship === 'ได้รับทุน' ? (
                              (() => {
                                const items = sanitizeReceivedScholarships(
                                  selectedStudent.basicInfo.receivedScholarships,
                                  selectedStudent.basicInfo.otherScholarshipDetail
                                );
                                return items.length > 0 ? (
                                  <ol className="list-decimal pl-4 space-y-0.5 text-[#23181A]">
                                    {items.map((item) => (
                                      <li key={item.id}>
                                        {item.name}
                                        {item.provider ? ` (${item.provider})` : ''}
                                      </li>
                                    ))}
                                  </ol>
                                ) : (
                                  <p>{formatReceivedScholarshipsText(selectedStudent.basicInfo) || 'ได้รับทุน'}</p>
                                );
                              })()
                            ) : (
                              <p className="text-[#66585B]">ไม่ได้รับทุนอื่น</p>
                            )}
                            {selectedStudent.application?.otherScholarshipNameAmount && (
                              <p className="text-[#5A4B4E] pt-1 border-t border-[#F0E8D8]">
                                <strong>ในแบบคำร้อง:</strong>{' '}
                                {selectedStudent.application.hasOtherScholarship} —{' '}
                                {selectedStudent.application.otherScholarshipNameAmount}
                              </p>
                            )}
                          </div>
                          <p>
                            <strong>ปัญหาทางการเงิน:</strong>{' '}
                            {selectedStudent.application?.financialProblemDetail || '-'}
                          </p>
                          <p>
                            <strong>เหตุผลความจำเป็น:</strong>{' '}
                            {selectedStudent.application?.scholarshipNecessityDetail ||
                              selectedStudent.basicInfo.necessityReason ||
                              '-'}
                          </p>
                          <p>
                            <strong>แผนการใช้ทุน:</strong>{' '}
                            {selectedStudent.application?.expectedBenefitDetail ||
                              selectedStudent.basicInfo.spendingPlan ||
                              '-'}
                          </p>
                        </div>

                        <div className="space-y-4 rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/70 p-5">
                          <h4 className="font-display font-bold text-[#7A1629]">
                            พิจารณาทุนการศึกษาและแสดงความคิดเห็น
                          </h4>
                          {!selectedStudent.application ? (
                            <p className="text-sm text-[#92400E]">
                              นักศึกษายังไม่ได้บันทึกใบสมัครทุนการศึกษา (กรอกไว้เฉพาะข้อมูลพื้นฐาน)
                            </p>
                          ) : (
                            <>
                              <div>
                                <label
                                  htmlFor="rev-status"
                                  className="block text-xs font-medium text-[#23181A] mb-1"
                                >
                                  ผลการพิจารณาทุนการศึกษา
                                </label>
                                <select
                                  id="rev-status"
                                  value={reviewStatus}
                                  onChange={(e) =>
                                    setReviewStatus(e.target.value as ApplicationStatus)
                                  }
                                  className="w-full rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
                                >
                                  <option value="submitted">ยื่นใบสมัครแล้ว</option>
                                  <option value="reviewing">กำลังพิจารณา</option>
                                  <option value="approved">
                                    อนุมัติทุนการศึกษา (ปลดล็อกจิตอาสา)
                                  </option>
                                  <option value="needs_revision">ขอข้อมูล/เอกสารเพิ่มเติม</option>
                                  <option value="rejected">ไม่ผ่านการพิจารณา</option>
                                </select>
                              </div>

                              <div>
                                <label
                                  htmlFor="rev-comment"
                                  className="block text-xs font-medium text-[#23181A] mb-1"
                                >
                                  ความคิดเห็นถึงนักศึกษา
                                </label>
                                <textarea
                                  id="rev-comment"
                                  rows={3}
                                  value={advisorComment}
                                  onChange={(e) => setAdvisorComment(e.target.value)}
                                  placeholder="พิมพ์ความคิดเห็นหรือข้อเสนอแนะถึงนักศึกษา..."
                                  className="w-full rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={handleSaveApplicationReview}
                                className="rounded-xl bg-[#7A1629] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D] transition-colors"
                              >
                                บันทึกผลการพิจารณาทุน
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* SECTION 2: All Basic Profiles & Staff Grade Attachment */}
            {activeSection === 'grades' && (
              <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6">
                <section className="lg:col-span-5 rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                  <div className="flex items-center gap-2 border-b border-[#EAE0CE] pb-3">
                    <Upload className="h-5 w-5 text-[#7A1629]" aria-hidden="true" />
                    <h2 className="font-display text-lg font-bold text-[#7A1629]">
                      อาจารย์แนบผลการเรียนให้นักศึกษา
                    </h2>
                  </div>

                  {students.length === 0 ? (
                    <p className="text-sm text-[#66585B] py-4">
                      ยังไม่มีรายชื่อนักศึกษาในระบบ กรุณานำเข้าข้อมูลนักศึกษาจาก Excel ก่อน
                    </p>
                  ) : (
                    <form onSubmit={handleStaffAttachGrade} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-[#23181A] mb-1">
                          เลือกนักศึกษา *
                        </label>
                        <select
                          value={gradeTargetStudentId}
                          onChange={(e) => setGradeTargetStudentId(e.target.value)}
                          className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                        >
                          {students.map((s) => (
                            <option key={s.user.id} value={s.user.id}>
                              {s.basicInfo.studentId || s.user.studentId} —{' '}
                              {s.basicInfo.fullName || s.user.fullName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[#23181A] mb-1">
                            ปีการศึกษา
                          </label>
                          <select
                            value={gradeYear}
                            onChange={(e) => setGradeYear(e.target.value as AcademicYear)}
                            className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                          >
                            {ACADEMIC_YEARS.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#23181A] mb-1">
                            ชั้นปี
                          </label>
                          <select
                            value={gradeLevel}
                            onChange={(e) => setGradeLevel(e.target.value as YearLevel)}
                            className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                          >
                            {YEAR_LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[#23181A] mb-1">
                            ภาคเรียน
                          </label>
                          <select
                            value={gradeSemester}
                            onChange={(e) => setGradeSemester(e.target.value as SemesterType)}
                            className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                          >
                            <option value="ภาคเรียนที่ 1">ภาคเรียนที่ 1</option>
                            <option value="ภาคเรียนที่ 2">ภาคเรียนที่ 2</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#23181A] mb-1">
                            เกรดเฉลี่ย *
                          </label>
                          <input
                            type="text"
                            value={gradeGpa}
                            onChange={(e) => setGradeGpa(e.target.value)}
                            placeholder="เช่น 3.70"
                            className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
                          />
                        </div>
                      </div>

                      <FileUploadField
                        label="แนบหลักฐานผลการเรียน (สูงสุด 3 MB)"
                        helperText="รองรับ PDF, JPG, PNG, WEBP"
                        files={gradeFiles}
                        onChange={setGradeFiles}
                        maxSizeMB={3}
                        allowPdf={true}
                      />

                      <button
                        type="submit"
                        className="w-full rounded-xl bg-[#7A1629] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D] transition-colors"
                      >
                        บันทึกผลการเรียนให้นักศึกษา
                      </button>
                    </form>
                  )}
                </section>

                <section className="lg:col-span-7 rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                  <h2 className="font-display text-lg font-bold text-[#7A1629] border-b border-[#EAE0CE] pb-3">
                    ข้อมูลพื้นฐานและประวัติผลการเรียนของนักศึกษาทั้งหมด
                  </h2>

                  {students.length === 0 ? (
                    <p className="text-sm text-[#66585B] py-4">ยังไม่มีข้อมูลนักศึกษาในระบบ</p>
                  ) : (
                    <div className="space-y-4">
                      {students.map((s) => (
                        <div
                          key={s.user.id}
                          className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/70 p-4 space-y-2 transition-colors hover:border-[#C6922C]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-display font-bold text-[#23181A]">
                                {s.basicInfo.fullName || s.user.fullName}{' '}
                                <span className="text-xs font-normal text-[#66585B] tabular-nums">
                                  ({s.basicInfo.studentId || s.user.studentId})
                                </span>
                              </p>
                              <p className="text-xs text-[#66585B] tabular-nums">
                                {s.basicInfo.yearLevel} · GPAX {s.basicInfo.gpax || '-'} · กยศ.:{' '}
                                {s.basicInfo.hasStudentLoan} · โทร {s.basicInfo.phone || '-'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPrintStudent(s)}
                              className="text-xs font-medium text-[#7A1629] hover:underline"
                            >
                              ดูโปรไฟล์ PDF
                            </button>
                          </div>

                          {s.grades.length > 0 && (
                            <div className="pt-2 border-t border-[#EAE0CE] flex flex-wrap gap-3 text-xs tabular-nums">
                              {s.grades.map((g) => (
                                <span key={g.id} className="text-[#23181A]">
                                  ปี {g.academicYear} ({g.semester}): <strong>{g.gpa}</strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* SECTION 3: Volunteer Progress & Hour Approval */}
            {activeSection === 'volunteers' && (
              <section className="no-print rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                <h2 className="font-display text-lg font-bold text-[#7A1629] border-b border-[#EAE0CE] pb-3">
                  ความคืบหน้าการทำจิตอาสาและการอนุมัติชั่วโมง
                </h2>

                {students.every((s) => s.volunteers.length === 0) ? (
                  <p className="text-sm text-[#66585B] py-6">
                    ยังไม่มีรายการบันทึกกิจกรรมจิตอาสาจากนักศึกษา
                  </p>
                ) : (
                  <div className="space-y-4">
                    {students.flatMap((s) =>
                      s.volunteers.map((vol) => (
                        <article
                          key={vol.id}
                          className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/70 p-5 space-y-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p className="text-xs font-semibold text-[#7A1629] tabular-nums">
                                {vol.studentName} ({vol.studentId}) · ปีการศึกษา {vol.academicYear} ·
                                วันที่ {vol.activityDate}
                              </p>
                              <h3 className="font-display text-base font-bold text-[#23181A] mt-0.5">
                                {vol.activityTitle}
                              </h3>
                            </div>

                            <div className="flex items-center gap-2">
                              {vol.approvalStatus === 'approved' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] tabular-nums">
                                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                  อนุมัติแล้ว {vol.approvedHours} ชั่วโมง
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleReviewVolunteer(vol.id, 'approved', vol.hours)
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#166534] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#14532D] tabular-nums"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>อนุมัติ ({vol.hours} ชม.)</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReviewVolunteer(vol.id, 'rejected', 0)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[#FCA5A5] bg-white px-3 py-1.5 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                                  >
                                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>ไม่อนุมัติ</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-[#23181A]">{vol.activityDetail}</p>
                          <p className="text-xs text-[#66585B]">
                            <strong>สิ่งที่ได้รับ:</strong> {vol.learnings} ·{' '}
                            <strong>การประยุกต์ใช้:</strong> {vol.dailyLifeApplication}
                          </p>

                          {vol.photos.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {vol.photos.map((p) => (
                                <a
                                  key={p.id}
                                  href={p.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block"
                                >
                                  <img
                                    src={p.url}
                                    alt={p.name}
                                    referrerPolicy="no-referrer"
                                    className="h-16 w-20 rounded-lg border border-[#D8C6A6] object-cover transition-transform hover:scale-105"
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                        </article>
                      ))
                    )}
                  </div>
                )}
              </section>
            )}

            {/* SECTION 4: Excel / CSV Import + Single Quick-Add */}
            {activeSection === 'excel-import' && (
              <div className="no-print grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Left: Bulk Excel Upload */}
                <section className="xl:col-span-7 rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-5 surface-card">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE0CE] pb-4">
                    <div className="space-y-0.5">
                      <h2 className="font-display text-lg font-bold text-[#7A1629]">
                        นำเข้ารายชื่อนักศึกษาจากไฟล์ Excel / CSV
                      </h2>
                      <p className="text-xs text-[#66585B]">
                        รองรับคอลัมน์: รหัสนักศึกษา, ชื่อ-นามสกุล, อีเมล (ไม่บังคับ), ปีการศึกษา, ชั้นปี, GPAX, เบอร์โทรศัพท์, กยศ.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadStudentImportTemplateExcel()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#C6922C] bg-[#FDF8EC] px-3.5 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#F7EBCB] transition-colors"
                    >
                      <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>ดาวน์โหลดไฟล์แม่แบบ (.xlsx)</span>
                    </button>
                  </div>

                  <div className="rounded-2xl border-2 border-dashed border-[#D8C6A6] bg-[#FAF6EE]/60 p-6 text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#15803D]">
                      <FileUp className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-display text-sm font-semibold text-[#23181A]">
                        {excelFileName
                          ? `ไฟล์ที่เลือก: ${excelFileName}`
                          : 'เลือกไฟล์ .xlsx, .xls หรือ .csv เพื่อตรวจสอบรายชื่อ'}
                      </p>
                      <p className="text-xs text-[#66585B]">
                        ระบุเพียงรหัสนักศึกษา 8 หลักและชื่อ-นามสกุล ระบบจะสร้างบัญชีพร้อมรหัสผ่านเริ่มต้น (รหัสนักศึกษา 8 หลัก) โดยอัตโนมัติ และให้นักศึกษาตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งแรก
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5B0F1D] transition-colors">
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        <span>เลือกไฟล์ Excel / CSV</span>
                        <input
                          ref={excelInputRef}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={(e) => handleExcelFileSelected(e.target.files?.[0])}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  {importSummary && (
                    <div className="rounded-xl border border-[#86EFAC] bg-[#F0FDF4] p-4 text-xs sm:text-sm text-[#166534] space-y-1">
                      <p className="font-semibold">นำเข้าข้อมูลลงฐานข้อมูลเรียบร้อยแล้ว</p>
                      <p className="tabular-nums">
                        สร้างบัญชีใหม่ {importSummary.createdCount} คน · อัปเดตข้อมูลเดิม{' '}
                        {importSummary.updatedCount} คน · ข้าม {importSummary.skippedCount} รายการ
                      </p>
                    </div>
                  )}

                  {parsedExcelErrors.length > 0 && (
                    <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 space-y-1.5">
                      <p className="text-xs font-bold text-[#991B1B]">
                        พบข้อผิดพลาด {parsedExcelErrors.length} แถว (จะไม่ถูกนำเข้า):
                      </p>
                      <ul className="list-disc pl-5 text-xs text-[#991B1B] space-y-0.5 max-h-36 overflow-y-auto">
                        {parsedExcelErrors.map((errItem) => (
                          <li key={errItem.rowNumber}>{errItem.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {parsedExcelRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[#15803D] tabular-nums">
                          พร้อมนำเข้าทั้งหมด {parsedExcelRows.length} รายการ
                        </p>
                        <button
                          type="button"
                          disabled={importingExcel}
                          onClick={handleCommitExcelImport}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#166534] px-4 py-2 text-xs font-semibold text-white hover:bg-[#14532D] disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          <span>
                            {importingExcel
                              ? 'กำลังบันทึกลงฐานข้อมูล...'
                              : `ยืนยันนำเข้า ${parsedExcelRows.length} รายชื่อ`}
                          </span>
                        </button>
                      </div>

                      <div className="overflow-x-auto max-h-72 border border-[#EAE0CE] rounded-xl">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-[#FAF6EE] sticky top-0">
                            <tr className="border-b border-[#EAE0CE] text-[#66585B]">
                              <th className="py-2 px-3 font-semibold">รหัส</th>
                              <th className="py-2 px-3 font-semibold">ชื่อ-นามสกุล</th>
                              <th className="py-2 px-3 font-semibold">อีเมล</th>
                              <th className="py-2 px-3 font-semibold">ปี/ชั้นปี</th>
                              <th className="py-2 px-3 font-semibold">GPAX</th>
                              <th className="py-2 px-3 font-semibold">กยศ.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0E8D8] tabular-nums">
                            {parsedExcelRows.map((row) => (
                              <tr key={row.studentId}>
                                <td className="py-2 px-3 font-medium">{row.studentId}</td>
                                <td className="py-2 px-3">{row.fullName}</td>
                                <td className="py-2 px-3 text-[#5A4B4E]">{row.email || '-'}</td>
                                <td className="py-2 px-3">
                                  {row.academicYear} / {row.yearLevel}
                                </td>
                                <td className="py-2 px-3">{row.gpax || '-'}</td>
                                <td className="py-2 px-3">{row.hasStudentLoan || 'ไม่กู้'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </section>

                {/* Right: Single Quick-Add Student Form */}
                <section className="xl:col-span-5 rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                  <div className="flex items-center gap-2 border-b border-[#EAE0CE] pb-3">
                    <UserPlus className="h-5 w-5 text-[#7A1629]" aria-hidden="true" />
                    <h2 className="font-display text-lg font-bold text-[#7A1629]">
                      เพิ่มรายชื่อนักศึกษาทีละคน
                    </h2>
                  </div>

                  <form onSubmit={handleQuickAddStudent} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="qa-id"
                          className="block text-xs font-medium text-[#23181A] mb-1"
                        >
                          รหัสนักศึกษา *
                        </label>
                        <input
                          id="qa-id"
                          type="text"
                          inputMode="numeric"
                          maxLength={8}
                          required
                          value={quickStudentId}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                            setQuickStudentId(val);
                          }}
                          placeholder="ตัวเลข 8 หลัก (เช่น 69xxxxxx)"
                          className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="qa-gpax"
                          className="block text-xs font-medium text-[#23181A] mb-1"
                        >
                          GPAX (ถ้ามี)
                        </label>
                        <input
                          id="qa-gpax"
                          type="text"
                          value={quickGpax}
                          onChange={(e) => setQuickGpax(e.target.value)}
                          placeholder="เช่น 3.50"
                          className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="qa-name"
                        className="block text-xs font-medium text-[#23181A] mb-1"
                      >
                        ชื่อ-นามสกุล *
                      </label>
                      <input
                        id="qa-name"
                        type="text"
                        required
                        value={quickFullName}
                        onChange={(e) => setQuickFullName(e.target.value)}
                        placeholder="เช่น นางสาวกานดา ใจดี"
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="qa-email"
                        className="block text-xs font-medium text-[#23181A] mb-1"
                      >
                        อีเมล (ไม่บังคับ)
                      </label>
                      <input
                        id="qa-email"
                        type="email"
                        value={quickEmail}
                        onChange={(e) => setQuickEmail(e.target.value)}
                        placeholder="เว้นว่างได้ หรือกรอกอีเมลติดต่อ"
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="qa-year"
                          className="block text-xs font-medium text-[#23181A] mb-1"
                        >
                          ปีการศึกษา
                        </label>
                        <select
                          id="qa-year"
                          value={quickAcademicYear}
                          onChange={(e) => setQuickAcademicYear(e.target.value as AcademicYear)}
                          className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                        >
                          {ACADEMIC_YEARS.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="qa-level"
                          className="block text-xs font-medium text-[#23181A] mb-1"
                        >
                          ชั้นปี
                        </label>
                        <select
                          id="qa-level"
                          value={quickYearLevel}
                          onChange={(e) => setQuickYearLevel(e.target.value as YearLevel)}
                          className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                        >
                          {YEAR_LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="qa-phone"
                          className="block text-xs font-medium text-[#23181A] mb-1"
                        >
                          เบอร์โทรศัพท์
                        </label>
                        <input
                          id="qa-phone"
                          type="text"
                          value={quickPhone}
                          onChange={(e) => setQuickPhone(e.target.value)}
                          placeholder="08X-XXX-XXXX"
                          className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="qa-loan"
                          className="block text-xs font-medium text-[#23181A] mb-1"
                        >
                          การกู้ยืม กยศ.
                        </label>
                        <select
                          id="qa-loan"
                          value={quickLoan}
                          onChange={(e) => setQuickLoan(e.target.value as 'กู้' | 'ไม่กู้')}
                          className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                        >
                          <option value="ไม่กู้">ไม่กู้</option>
                          <option value="กู้">กู้ กยศ.</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={creatingSingleStudent}
                      className="w-full rounded-xl bg-[#7A1629] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5B0F1D] transition-colors disabled:opacity-60"
                    >
                      {creatingSingleStudent ? 'กำลังบันทึก...' : 'เพิ่มรายชื่อนักศึกษา'}
                    </button>
                  </form>
                </section>
              </div>
            )}

            {/* SECTION 5: PDF Report Center (Live A4 Print Preview + Fit All Columns PDF) */}
            {activeSection === 'pdf-reports' && (
              <div className="space-y-5">
                {!printStudent && (
                  <style>{`@media print { @page { size: A4 ${reportOrientation}; margin: 10mm; } }`}</style>
                )}

                <section className="no-print rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg font-bold text-[#7A1629]">
                          ตัวอย่างหน้าก่อนพิมพ์จริง &amp; ดาวน์โหลดรายงาน PDF
                        </h2>
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#E5CFA0] bg-[#FDF8EC] px-2.5 py-0.5 text-[11px] font-semibold text-[#7A1629]">
                          Fit All Columns on One Page
                        </span>
                      </div>
                      <p className="text-xs text-[#66585B] mt-0.5">
                        แสดงหน้ากระดาษ A4 จริงพร้อมทุกคอลัมน์ในหน้าเดียวก่อนสั่งพิมพ์หรือดาวน์โหลดไฟล์ .pdf
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        role="group"
                        aria-label="เลือกแนวกระดาษรายงาน A4"
                        className="inline-flex rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] p-1 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => setReportOrientation('landscape')}
                          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                            reportOrientation === 'landscape'
                              ? 'bg-[#7A1629] text-white'
                              : 'text-[#5A4B4E] hover:text-[#23181A]'
                          }`}
                        >
                          A4 แนวนอน (แนะนำ)
                        </button>
                        <button
                          type="button"
                          onClick={() => setReportOrientation('portrait')}
                          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                            reportOrientation === 'portrait'
                              ? 'bg-[#7A1629] text-white'
                              : 'text-[#5A4B4E] hover:text-[#23181A]'
                          }`}
                        >
                          A4 แนวตั้ง
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={downloadingSummaryPdf || filteredStudents.length === 0}
                        onClick={handleDownloadSummaryPdf}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#7A1629] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#5B0F1D] transition-colors disabled:opacity-55"
                      >
                        {downloadingSummaryPdf ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                        ) : (
                          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {downloadingSummaryPdf
                            ? 'กำลังสร้างไฟล์ PDF...'
                            : `ดาวน์โหลดรายงาน PDF (${filteredStudents.length} คน)`}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={preparingDirectPrint || downloadingSummaryPdf || filteredStudents.length === 0}
                        onClick={handleDirectPrintSummary}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#7A1629] bg-white px-4 py-2.5 text-xs font-semibold text-[#7A1629] hover:bg-[#FAF6EE] transition-colors disabled:opacity-55"
                      >
                        {preparingDirectPrint ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                        ) : (
                          <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {preparingDirectPrint ? 'กำลังเปิดหน้าจอพิมพ์...' : 'สั่งพิมพ์จริง (Print)'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      aria-label="ปีการศึกษา"
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value as AcademicYear | 'all')}
                      className="rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                    >
                      <option value="all">ทุกปีการศึกษา</option>
                      {ACADEMIC_YEARS.map((y) => (
                        <option key={y} value={y}>
                          ปีการศึกษา {y}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="ชั้นปี"
                      value={filterLevel}
                      onChange={(e) => setFilterLevel(e.target.value as YearLevel | 'all')}
                      className="rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                    >
                      <option value="all">ทุกชั้นปี</option>
                      {YEAR_LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="สถานะทุน"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as ApplicationStatus | 'all')}
                      className="rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                    >
                      <option value="all">ทุกสถานะทุน</option>
                      <option value="approved">อนุมัติทุนการศึกษา</option>
                      <option value="submitted">ยื่นใบสมัครแล้ว</option>
                      <option value="reviewing">กำลังพิจารณา</option>
                      <option value="draft">ฉบับร่าง</option>
                    </select>
                  </div>
                </section>

                {/* Live A4 Paper Print Preview Desk */}
                <div className="a4-preview-desk rounded-2xl border border-[#DFD1BA] bg-[#E8DFCE] p-3 sm:p-6 overflow-x-auto print:border-0 print:bg-white print:p-0">
                  <div className="no-print mx-auto mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-[#5A4B4E] max-w-[1060px]">
                    <span>
                      หน้าต่างแสดงผลก่อนพิมพ์จริง (Print Preview) · ขนาด{' '}
                      {reportOrientation === 'landscape'
                        ? 'A4 แนวนอน (297 × 210 มม.)'
                        : 'A4 แนวตั้ง (210 × 297 มม.)'}
                    </span>
                    <span className="tabular-nums">
                      จัดคอลัมน์พอดี 1 หน้า (Fit All Columns) · {filteredStudents.length} รายการ
                    </span>
                  </div>

                  <section
                    id="staff-pdf-report-sheet"
                    ref={reportSheetRef}
                    className={`a4-paper-sheet mx-auto rounded-sm border border-[#D8CBB8] bg-white p-5 sm:p-8 shadow-xl print:border-0 print:shadow-none print:p-0 ${
                      reportOrientation === 'landscape'
                        ? 'w-full max-w-[1060px]'
                        : 'w-full max-w-[794px]'
                    }`}
                  >
                    <div className="mb-4 flex items-center justify-between gap-4 border-b-2 border-[#7A1629] pb-4">
                      <div className="flex items-center gap-4">
                        <img
                          src="/assets/aistudio/image_7437b452.png"
                          alt="EDU SOCIAL CARE CMRU"
                          referrerPolicy="no-referrer"
                          className="h-14 w-auto object-contain shrink-0"
                        />
                        <div>
                          <h3 className="font-display text-base sm:text-lg font-bold text-[#7A1629]">
                            รายงานสรุปข้อมูลนักศึกษาทุนการศึกษา &amp; กยศ.
                          </h3>
                          <p className="text-xs text-[#5A4B4E]">
                            สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่ ·{' '}
                            {filterYear === 'all' ? 'ทุกปีการศึกษา' : `ปีการศึกษา ${filterYear}`} ·{' '}
                            {filterLevel === 'all' ? 'ทุกชั้นปี' : filterLevel} · จำนวน{' '}
                            {filteredStudents.length} คน
                          </p>
                        </div>
                      </div>
                      <div className="hidden sm:block text-right text-[11px] text-[#66585B] tabular-nums shrink-0">
                        <p className="font-semibold text-[#7A1629]">EDU SOCIAL CARE CMRU</p>
                        <p>
                          {reportOrientation === 'landscape' ? 'A4 Landscape' : 'A4 Portrait'} · Fit All Columns
                        </p>
                      </div>
                    </div>

                    {filteredStudents.length === 0 ? (
                      <p className="py-10 text-center text-sm text-[#66585B]">
                        ยังไม่มีข้อมูลนักศึกษาสำหรับพิมพ์รายงาน
                      </p>
                    ) : (
                      <div className="pdf-fit-table-wrap w-full overflow-x-auto">
                        <table className="w-full text-left text-[11px] sm:text-xs border-collapse">
                          <thead>
                            <tr className="border-b-2 border-[#EAE0CE] bg-[#FAF6EE] text-[#5A4B4E]">
                              <th className="py-2 px-1.5 font-semibold whitespace-nowrap">ที่</th>
                              <th className="py-2 px-2 font-semibold whitespace-nowrap">รหัสนักศึกษา</th>
                              <th className="py-2 px-2 font-semibold">ชื่อ-นามสกุล</th>
                              <th className="py-2 px-1.5 font-semibold whitespace-nowrap">ชั้นปี</th>
                              <th className="py-2 px-1.5 font-semibold whitespace-nowrap">GPAX</th>
                              <th className="py-2 px-1.5 font-semibold whitespace-nowrap">กยศ.</th>
                              <th className="py-2 px-2 font-semibold whitespace-nowrap">สถานะทุน</th>
                              <th className="py-2 px-2 font-semibold">ทุนการศึกษาที่ได้รับทั้งหมด</th>
                              <th className="py-2 px-2 font-semibold">เหตุผล / ความเห็นอาจารย์</th>
                              <th className="py-2 px-1.5 font-semibold whitespace-nowrap text-right">จิตอาสา</th>
                              <th className="no-print py-2 pl-2 text-right font-semibold whitespace-nowrap">
                                โปรไฟล์ PDF
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0E8D8] tabular-nums">
                            {filteredStudents.map((rec, idx) => {
                              const vol = calculateApprovedVolunteerHours(rec.volunteers);
                              const statusMeta = getApplicationStatusMeta(rec.application?.status);
                              const schItems =
                                rec.basicInfo.hasOtherScholarship === 'ได้รับทุน'
                                  ? sanitizeReceivedScholarships(
                                      rec.basicInfo.receivedScholarships,
                                      rec.basicInfo.otherScholarshipDetail
                                    )
                                  : [];
                              const appSchNote = rec.application?.otherScholarshipNameAmount?.trim();
                              const necessitySummary =
                                rec.application?.scholarshipNecessityDetail ||
                                rec.basicInfo.necessityReason ||
                                rec.application?.financialProblemDetail ||
                                '-';
                              const reviewerNote = rec.application?.advisorComment?.trim();
                              return (
                                <tr key={rec.user.id}>
                                  <td className="py-2 px-1.5 whitespace-nowrap align-top">{idx + 1}</td>
                                  <td className="py-2 px-2 font-medium whitespace-nowrap align-top">
                                    {rec.basicInfo.studentId || rec.user.studentId || '-'}
                                  </td>
                                  <td className="py-2 px-2 font-medium break-words align-top">
                                    {rec.basicInfo.fullName || rec.user.fullName}
                                  </td>
                                  <td className="py-2 px-1.5 whitespace-nowrap align-top">
                                    {rec.application?.yearLevel || rec.basicInfo.yearLevel}
                                  </td>
                                  <td className="py-2 px-1.5 whitespace-nowrap align-top">
                                    {rec.application?.gpax || rec.basicInfo.gpax || '-'}
                                  </td>
                                  <td className="py-2 px-1.5 whitespace-nowrap align-top">
                                    {rec.basicInfo.hasStudentLoan}
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap align-top">
                                    {statusMeta.label}
                                  </td>
                                  <td className="py-2 px-2 break-words max-w-[230px] align-top">
                                    {schItems.length > 0 ? (
                                      <ul className="space-y-0.5 text-[11px]">
                                        {schItems.map((item) => (
                                          <li key={item.id}>
                                            • {item.name}
                                            {item.provider ? ` (${item.provider})` : ''}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : rec.basicInfo.hasOtherScholarship === 'ได้รับทุน' ? (
                                      formatReceivedScholarshipsText(rec.basicInfo) || 'ได้รับทุน'
                                    ) : (
                                      '-'
                                    )}
                                    {appSchNote && (
                                      <p className="text-[10px] text-[#5A4B4E] mt-0.5">
                                        คำร้อง: {appSchNote}
                                      </p>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 break-words max-w-[200px] align-top text-[11px] text-[#374151]">
                                    <p>{necessitySummary}</p>
                                    {reviewerNote && (
                                      <p className="mt-0.5 text-[#7A1629]">
                                        ความเห็น: {reviewerNote}
                                      </p>
                                    )}
                                  </td>
                                  <td className="py-2 px-1.5 whitespace-nowrap text-right align-top">
                                    {vol.approvedHours} ชม.
                                  </td>
                                  <td className="no-print py-2 pl-2 text-right whitespace-nowrap align-top">
                                    <button
                                      type="button"
                                      onClick={() => setPrintStudent(rec)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#7A1629] px-2.5 py-1 text-xs font-medium text-[#7A1629] hover:bg-[#FAF6EE]"
                                    >
                                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>พิมพ์รายคน</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-[#EAE0CE] pt-4 text-xs text-[#23181A]">
                      <div className="text-[11px] text-[#66585B] space-y-1">
                        <p className="font-medium text-[#23181A]">
                          EDU SOCIAL CARE CMRU · สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
                        </p>
                        <p className="tabular-nums">
                          รวมทั้งสิ้น {filteredStudents.length} คน · พิมพ์เมื่อ{' '}
                          {new Date().toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-self-end sm:pr-4">
                        <div className="flex items-end justify-center gap-2">
                          <span className="shrink-0 leading-none">ลงชื่อ</span>
                          <span className="inline-block w-44 border-b border-dotted border-[#374151] h-4" />
                        </div>
                        <p className="mt-2 text-center">
                          ({' '}
                          {resolveAdvisorDisplayName({
                            currentUserRole: currentUser.role,
                            currentUserName: currentUser.fullName,
                            registeredTeacherNames: teacherNames,
                          }) || '........................................'}{' '}
                          )
                        </p>
                        <p className="mt-0.5 text-center font-medium text-[#4B5563]">
                          อาจารย์ผู้รับรองรายงาน
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {/* SECTION 6: Admin User & Password Management */}
            {isAdmin && activeSection === 'admin-users' && (
              <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6">
                <section className="lg:col-span-7 rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                  <div className="flex items-center gap-2 border-b border-[#EAE0CE] pb-3">
                    <KeyRound className="h-5 w-5 text-[#7A1629]" aria-hidden="true" />
                    <h2 className="font-display text-lg font-bold text-[#7A1629]">
                      จัดการผู้ใช้งานและแก้ไขรหัสผ่าน ({allUsers.length} บัญชี)
                    </h2>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[#EAE0CE] text-xs text-[#66585B]">
                          <th className="py-2.5 pr-3 font-semibold">บทบาท</th>
                          <th className="py-2.5 pr-3 font-semibold">ชื่อ-นามสกุล</th>
                          <th className="py-2.5 pr-3 font-semibold">ชื่อผู้ใช้ / สถานะรหัสผ่าน</th>
                          <th className="py-2.5 font-semibold text-right">จัดการบัญชี</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0E8D8]">
                        {allUsers.map((u) => {
                          const adminCount = allUsers.filter((item) => item.role === 'admin').length;
                          const deletePermission = canDeleteUserAccount({
                            actorRole: currentUser.role,
                            actorUserId: currentUser.id,
                            targetUserId: u.id,
                            targetRole: u.role,
                            adminCount,
                          });
                          const lockState = evaluateLoginAttemptStatus({
                            failedLoginAttempts: u.failedLoginAttempts,
                            lockedUntil: u.lockedUntil,
                          });
                          return (
                            <tr key={u.id} className="hover:bg-[#FAF6EE]/60 transition-colors">
                              <td className="py-2.5 pr-3 text-xs font-semibold text-[#7A1629]">
                                {u.role === 'student'
                                  ? 'นักศึกษา'
                                  : u.role === 'teacher'
                                    ? 'อาจารย์'
                                    : 'ผู้ดูแลระบบ'}
                              </td>
                              <td className="py-2.5 pr-3 font-medium">{u.fullName}</td>
                              <td className="py-2.5 pr-3 text-xs text-[#66585B]">
                                <div className="font-mono tabular-nums">{u.username}</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {lockState.isLocked ? (
                                    <span className="inline-flex items-center rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-1.5 py-0.5 text-[11px] font-medium text-[#991B1B]">
                                      ระงับชั่วคราว (ผิดเกิน 5 ครั้ง)
                                    </span>
                                  ) : u.role === 'student' ? (
                                    u.mustChangePassword ? (
                                      <span className="inline-flex items-center rounded-md border border-[#FCD34D] bg-[#FFFBEB] px-1.5 py-0.5 text-[11px] font-medium text-[#92400E]">
                                        รอเปลี่ยนรหัสผ่านครั้งแรก
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-md border border-[#86EFAC] bg-[#F0FDF4] px-1.5 py-0.5 text-[11px] font-medium text-[#166534]">
                                        ตั้งรหัสผ่านส่วนตัวแล้ว
                                      </span>
                                    )
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2.5 text-right">
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    aria-label={
                                      u.role === 'student'
                                        ? `รีเซ็ตรหัสผ่าน ${u.fullName}`
                                        : `แก้ไขรหัสผ่าน ${u.fullName}`
                                    }
                                    onClick={() => {
                                      setResetTargetUser(u);
                                      setResetMode(u.role === 'student' ? 'default' : 'custom');
                                      setNewPasswordInput('');
                                    }}
                                    className="rounded-lg border border-[#C6922C] bg-[#FDF8EC] px-2.5 py-1 text-xs font-medium text-[#7A1629] hover:bg-[#F7EBCB] transition-colors"
                                  >
                                    {u.role === 'student' ? 'รีเซ็ตรหัสผ่าน' : 'แก้ไขรหัสผ่าน'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!deletePermission.allowed}
                                    title={deletePermission.reason || `ลบบัญชี ${u.fullName}`}
                                    aria-label={`ลบบัญชี ${u.fullName}`}
                                    onClick={() => setDeleteTargetUser(u)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-1 text-xs font-medium text-[#991B1B] hover:bg-[#FEE2E2] disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    <span>ลบบัญชี</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="lg:col-span-5 rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                  <div className="flex items-center gap-2 border-b border-[#EAE0CE] pb-3">
                    <UserPlus className="h-5 w-5 text-[#7A1629]" aria-hidden="true" />
                    <h2 className="font-display text-lg font-bold text-[#7A1629]">
                      เพิ่มบัญชีผู้ใช้ใหม่โดยผู้ดูแลระบบ
                    </h2>
                  </div>

                  <form onSubmit={handleAdminCreateUser} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[#23181A] mb-1">
                        ประเภทผู้ใช้
                      </label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      >
                        <option value="student">นักศึกษา (รหัสนักศึกษา)</option>
                        <option value="teacher">อาจารย์</option>
                        <option value="admin">ผู้ดูแลระบบ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#23181A] mb-1">
                        ชื่อ-นามสกุล *
                      </label>
                      <input
                        type="text"
                        required
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#23181A] mb-1">
                        {newUserRole === 'student'
                          ? 'รหัสนักศึกษา *'
                          : 'ชื่อผู้ใช้ (Username) *'}
                      </label>
                        <input
                        type="text"
                        required
                        maxLength={newUserRole === 'student' ? 8 : 40}
                        value={newUsername}
                        onChange={(e) =>
                          setNewUsername(
                            newUserRole === 'student'
                              ? e.target.value.replace(/\D/g, '').slice(0, 8)
                              : e.target.value
                          )
                        }
                        placeholder={
                          newUserRole === 'student' ? 'ตัวเลข 8 หลัก (เช่น 69xxxxxx)' : 'username'
                        }
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#23181A] mb-1">
                        {newUserRole === 'student'
                          ? 'รหัสผ่านเริ่มต้น (เว้นว่างเพื่อสร้างอัตโนมัติ)'
                          : 'รหัสผ่าน *'}
                      </label>
                      <input
                        type="password"
                        required={newUserRole !== 'student'}
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder={
                          newUserRole === 'student'
                            ? 'เว้นว่างใช้รหัสนักศึกษา 8 หลัก (บังคับเปลี่ยนครั้งแรก)'
                            : 'อย่างน้อย 4 ตัวอักษร'
                        }
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-[#7A1629] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D] transition-colors"
                    >
                      สร้างบัญชีผู้ใช้งาน
                    </button>
                  </form>
                </section>
              </div>
            )}

            {/* SECTION 7: Google Sheets / Apps Script / Backup */}
            {isAdmin && activeSection === 'integrations' && (
              <section className="no-print rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EAE0CE] pb-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-[#7A1629]" aria-hidden="true" />
                    <h2 className="font-display text-lg font-bold text-[#7A1629]">
                      ศูนย์เชื่อมต่อ Google Sheets, Apps Script &amp; สำรองข้อมูล
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => exportStudentsToExcel(students)}
                      className="rounded-xl bg-[#166534] px-4 py-2 text-xs font-medium text-white hover:bg-[#14532D] transition-colors"
                    >
                      ดาวน์โหลด Excel ทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() => exportStudentsToCsv(students)}
                      className="rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-4 py-2 text-xs font-medium text-[#23181A] hover:bg-[#EFE5D1] transition-colors"
                    >
                      ดาวน์โหลด CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadJsonBackup}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] bg-white px-4 py-2 text-xs font-medium text-[#7A1629] hover:bg-[#FAF6EE] transition-colors"
                    >
                      <DatabaseBackup className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>สำรองข้อมูล (JSON)</span>
                    </button>
                  </div>
                </div>

                <p className="text-sm text-[#66585B]">
                  คัดลอกโค้ด Google Apps Script (`Code.gs`) ด้านล่างไปวางใน Google Apps Script
                  เพื่อเชื่อมต่อกับ Google Sheets และโฟลเดอร์ Google Drive ของสาขาวิชาสังคมศึกษา
                </p>

                <pre className="max-h-96 overflow-auto rounded-xl border border-[#EAE0CE] bg-[#1F1718] p-4 text-xs text-[#F5ECD9] font-mono">
                  {appsScriptCode || 'กำลังโหลดเทมเพลต...'}
                </pre>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Password Reset Modal */}
      {resetTargetUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="รีเซ็ตรหัสผ่านผู้ใช้งาน"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleResetPasswordSubmit}
            className="w-full max-w-md rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-4 surface-elevated"
          >
            <h3 className="font-display text-lg font-bold text-[#7A1629]">
              {resetTargetUser.role === 'student' ? 'รีเซ็ตรหัสผ่านนักศึกษา' : 'แก้ไขรหัสผ่าน'}:{' '}
              {resetTargetUser.fullName}
            </h3>
            <p className="text-xs text-[#66585B] leading-relaxed">
              บัญชี: <span className="font-mono font-semibold">{resetTargetUser.username}</span> ·{' '}
              ผู้ดูแลระบบไม่สามารถดูรหัสผ่านเดิมของนักศึกษาได้ เพื่อความปลอดภัยของข้อมูลส่วนตัว
            </p>

            {resetTargetUser.role === 'student' && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] p-1">
                  <button
                    type="button"
                    onClick={() => setResetMode('default')}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      resetMode === 'default'
                        ? 'bg-[#7A1629] text-white'
                        : 'text-[#5A4B4E] hover:text-[#7A1629]'
                    }`}
                  >
                    รหัสผ่านเริ่มต้น (รหัสนักศึกษา)
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetMode('custom')}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      resetMode === 'custom'
                        ? 'bg-[#7A1629] text-white'
                        : 'text-[#5A4B4E] hover:text-[#7A1629]'
                    }`}
                  >
                    กำหนดรหัสชั่วคราวเอง
                  </button>
                </div>

                {resetMode === 'default' && (
                  <div className="rounded-xl border border-[#DFC9A1] bg-[#FDF8EC] p-3.5 text-xs text-[#5C410A] leading-relaxed">
                    ระบบจะรีเซ็ตรหัสผ่านกลับเป็นรหัสผ่านเริ่มต้น{' '}
                    <span className="font-semibold text-[#7A1629]">รหัสนักศึกษา 8 หลัก</span>{' '}
                    ปลดล็อกบัญชีหากถูกระงับชั่วคราว และบังคับให้นักศึกษาตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งถัดไป
                  </div>
                )}
              </div>
            )}

            {(resetTargetUser.role !== 'student' || resetMode === 'custom') && (
              <div>
                <label
                  htmlFor="reset-pw-input"
                  className="block text-sm font-medium text-[#23181A] mb-1"
                >
                  {resetTargetUser.role === 'student' ? 'รหัสผ่านชั่วคราวใหม่ *' : 'รหัสผ่านใหม่ *'}
                </label>
                <input
                  id="reset-pw-input"
                  type="password"
                  required
                  minLength={resetTargetUser.role === 'student' ? 10 : 4}
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder={
                    resetTargetUser.role === 'student'
                      ? 'อย่างน้อย 10 ตัวอักษร (A-Z, a-z, 0-9)'
                      : 'อย่างน้อย 4 ตัวอักษร'
                  }
                  className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3.5 py-2 text-sm"
                />
                {resetTargetUser.role === 'student' && (
                  <p className="mt-1.5 text-[11px] text-[#66585B]">
                    นักศึกษาจะต้องเปลี่ยนรหัสผ่านใหม่ทันทีเมื่อเข้าสู่ระบบครั้งถัดไป และบัญชีจะถูกปลดล็อกหากถูกระงับชั่วคราว
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTargetUser(null)}
                className="rounded-xl border border-[#D8CBB8] px-4 py-2 text-sm text-[#5A4B4E] hover:bg-[#FAF6EE]"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#7A1629] px-5 py-2 text-sm font-medium text-white hover:bg-[#5B0F1D]"
              >
                {resetTargetUser.role === 'student' && resetMode === 'default'
                  ? 'ยืนยันรีเซ็ตรหัสผ่านเริ่มต้น'
                  : 'บันทึกรหัสผ่านใหม่'}
              </button>
            </div>
          </motion.form>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteTargetUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ยืนยันการลบบัญชีผู้ใช้งาน"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-2xl border border-[#FCA5A5] bg-white p-6 space-y-4 surface-elevated"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C]">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-[#991B1B]">
                  ยืนยันการลบบัญชีผู้ใช้
                </h3>
                <p className="text-xs text-[#66585B] mt-0.5">
                  การดำเนินการนี้ไม่สามารถย้อนกลับได้
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] p-3.5 text-sm space-y-1">
              <p className="font-semibold text-[#23181A]">{deleteTargetUser.fullName}</p>
              <p className="text-xs text-[#66585B]">
                บัญชี: {deleteTargetUser.username} · บทบาท:{' '}
                {deleteTargetUser.role === 'student'
                  ? 'นักศึกษา'
                  : deleteTargetUser.role === 'teacher'
                    ? 'อาจารย์'
                    : 'ผู้ดูแลระบบ'}
              </p>
              {deleteTargetUser.role === 'student' && (
                <p className="text-xs text-[#991B1B] pt-1">
                  ข้อมูลพื้นฐาน ใบสมัครทุนการศึกษา ผลการเรียน และบันทึกจิตอาสาของนักศึกษาคนนี้จะถูกลบออกทั้งหมด
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deletingUser}
                onClick={() => setDeleteTargetUser(null)}
                className="rounded-xl border border-[#D8CBB8] px-4 py-2 text-sm text-[#5A4B4E] hover:bg-[#FAF6EE]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deletingUser}
                onClick={handleConfirmDeleteUser}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{deletingUser ? 'กำลังลบ...' : 'ยืนยันลบบัญชี'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Individual Student Print Modal */}
      {printStudent && (
        <StudentProfilePrintView
          record={printStudent}
          currentUser={currentUser}
          teacherNames={teacherNames}
          onClose={() => setPrintStudent(null)}
        />
      )}

      {directPrintData && (
        <DirectPrintModal
          blobUrl={directPrintData.blobUrl}
          filename={directPrintData.filename}
          pageCount={directPrintData.pageCount}
          orientation={directPrintData.orientation}
          pageImages={directPrintData.pageImages}
          onClose={() => setDirectPrintData(null)}
        />
      )}
    </DashboardShell>
  );
}
