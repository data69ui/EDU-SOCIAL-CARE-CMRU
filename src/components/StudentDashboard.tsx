import { useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  LayoutDashboard,
  Lock,
  Printer,
  TrendingUp,
  Unlock,
  UserCheck,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  BasicInfoData,
  GradeRecord,
  ScholarshipApplicationData,
  StudentFullRecord,
  VolunteerRecord,
} from '../types/scholarship';
import {
  calculateApprovedVolunteerHours,
  getApplicationStatusMeta,
  isVolunteerModuleUnlocked,
  sanitizeReceivedScholarships,
} from '../utils/scholarshipLogic';
import { DashboardShell, type SidebarNavGroup } from './DashboardShell';
import { ChangePasswordPanel } from './ChangePasswordPanel';
import { StudentApplicationForm } from './StudentApplicationForm';
import { StudentBasicInfoForm } from './StudentBasicInfoForm';
import { StudentGradesView } from './StudentGradesView';
import { StudentProfilePrintView } from './StudentProfilePrintView';
import { StudentProgressView } from './StudentProgressView';
import { StudentVolunteerView } from './StudentVolunteerView';

export type StudentSectionKey =
  | 'home'
  | 'basic'
  | 'application'
  | 'grades'
  | 'progress'
  | 'volunteer'
  | 'password';

interface StudentDashboardProps {
  bundle: StudentFullRecord;
  teacherNames?: string[];
  activeSection: StudentSectionKey;
  onSelectSection: (section: StudentSectionKey) => void;
  onUpdateBundle: (next: StudentFullRecord) => void;
  onLogout: () => void;
  onDeleteAccount?: () => Promise<void>;
  statusBanner?: string | null;
  onDismissStatusBanner?: () => void;
}

const SECTION_META: Record<StudentSectionKey, { title: string; breadcrumb: string }> = {
  home: { title: 'Dashboard', breadcrumb: 'ภาพรวมนักศึกษาขอรับทุนการศึกษา' },
  basic: { title: '1. ข้อมูลพื้นฐาน & PDPA', breadcrumb: 'ประวัตินักศึกษา ครอบครัว และความยินยอม' },
  application: { title: '2. สมัครทุนการศึกษา', breadcrumb: 'แบบคำร้องขอรับทุนและภาพถ่ายประกอบ' },
  grades: { title: '3. ผลการเรียน', breadcrumb: 'บันทึก GPA ภาคเรียนที่ 1 และ 2' },
  progress: { title: '4. ความคืบหน้าสมัครทุน', breadcrumb: 'ติดตามผลการพิจารณาและความเห็นอาจารย์' },
  volunteer: { title: '5. ระบบจิตอาสา', breadcrumb: 'บันทึกกิจกรรมและชั่วโมงจิตอาสา' },
  password: { title: 'เปลี่ยนรหัสผ่าน', breadcrumb: 'จัดการความปลอดภัยและรหัสผ่านบัญชีนักศึกษา' },
};

export function StudentDashboard({
  bundle,
  teacherNames,
  activeSection,
  onSelectSection,
  onUpdateBundle,
  onLogout,
  onDeleteAccount,
  statusBanner,
  onDismissStatusBanner,
}: StudentDashboardProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const { user, basicInfo, application, grades, volunteers } = bundle;
  const statusMeta = getApplicationStatusMeta(application?.status);
  const volunteerUnlocked = isVolunteerModuleUnlocked(application);
  const volSummary = calculateApprovedVolunteerHours(volunteers);
  const myScholarships =
    basicInfo.hasOtherScholarship === 'ได้รับทุน'
      ? sanitizeReceivedScholarships(basicInfo.receivedScholarships, basicInfo.otherScholarshipDetail)
      : [];

  const handleBasicUpdated = (nextBasic: BasicInfoData) => {
    onUpdateBundle({ ...bundle, basicInfo: nextBasic });
  };

  const handleApplicationSaved = (nextApp: ScholarshipApplicationData) => {
    onUpdateBundle({ ...bundle, application: nextApp });
  };

  const handleGradeSaved = (grade: GradeRecord) => {
    const others = grades.filter((g) => g.id !== grade.id);
    onUpdateBundle({ ...bundle, grades: [...others, grade] });
  };

  const handleVolunteerAdded = (vol: VolunteerRecord) => {
    onUpdateBundle({ ...bundle, volunteers: [vol, ...volunteers] });
  };

  const checklistSteps = [
    {
      label: 'ยินยอม PDPA & กรอกข้อมูลพื้นฐาน',
      done: Boolean(basicInfo.pdpaConsented && !basicInfo.isDraft),
      key: 'basic' as const,
    },
    {
      label: 'ยื่นใบสมัครขอรับทุนการศึกษา',
      done: Boolean(application && application.status !== 'draft'),
      key: 'application' as const,
    },
    {
      label: 'บันทึกใบแสดงผลการเรียน (GPA)',
      done: grades.length > 0,
      key: 'grades' as const,
    },
    {
      label: 'ได้รับอนุมัติทุน & เปิดระบบจิตอาสา',
      done: volunteerUnlocked,
      key: 'volunteer' as const,
    },
  ];
  const completedCount = checklistSteps.filter((s) => s.done).length;
  const progressPct = Math.round((completedCount / checklistSteps.length) * 100);

  const navGroups: SidebarNavGroup[] = [
    {
      title: 'เมนูหลักนักศึกษา',
      items: [
        { key: 'home', label: 'ภาพรวม (Dashboard)', icon: LayoutDashboard },
        {
          key: 'basic',
          label: '1. ข้อมูลพื้นฐาน & PDPA',
          icon: UserCheck,
          badge: basicInfo.pdpaConsented && !basicInfo.isDraft ? 'ครบ' : undefined,
        },
        { key: 'application', label: '2. สมัครทุนการศึกษา', icon: FileSpreadsheet },
        {
          key: 'grades',
          label: '3. ผลการเรียน',
          icon: GraduationCap,
          badge: grades.length > 0 ? grades.length : undefined,
        },
        { key: 'progress', label: '4. ความคืบหน้าสมัครทุน', icon: TrendingUp },
        {
          key: 'volunteer',
          label: '5. ระบบจิตอาสา',
          icon: volunteerUnlocked ? HeartHandshake : Lock,
          badge: volunteerUnlocked ? `${volSummary.approvedHours} ชม.` : 'ล็อก',
        },
      ],
    },
    {
      title: 'ความปลอดภัยบัญชี',
      items: [
        { key: 'password', label: 'เปลี่ยนรหัสผ่าน', icon: KeyRound },
      ],
    },
  ];

  const kpiCards = [
    {
      title: 'สถานะการสมัครทุน',
      value: statusMeta.label,
      meta: `ความพร้อม ${completedCount}/4 ขั้นตอน (${progressPct}%)`,
      iconBg: 'bg-[#F8ECED] text-[#7A1629]',
      icon: ClipboardCheck,
    },
    {
      title: 'เกรดเฉลี่ยสะสม (GPAX)',
      value: basicInfo.gpax || '-',
      meta: `${basicInfo.yearLevel} · กยศ.: ${basicInfo.hasStudentLoan || 'ไม่กู้'}`,
      iconBg: 'bg-[#EFF6FF] text-[#1D4ED8]',
      icon: GraduationCap,
    },
    {
      title: 'ใบแสดงผลการเรียน',
      value: `${grades.length} ภาคเรียน`,
      meta:
        grades.length > 0
          ? `ล่าสุด GPA ${grades[grades.length - 1]?.gpa || '-'}`
          : 'ยังไม่พบบันทึกผลการเรียน',
      iconBg: 'bg-[#FFFBEB] text-[#B45309]',
      icon: FileSpreadsheet,
    },
    {
      title: 'ชั่วโมงจิตอาสา (อนุมัติ)',
      value: `${volSummary.approvedHours} ชม.`,
      meta: volunteerUnlocked
        ? `รออนุมัติ ${volSummary.pendingHours} ชม.`
        : 'เปิดใช้งานหลังได้รับอนุมัติทุน',
      iconBg: 'bg-[#ECFDF5] text-[#15803D]',
      icon: HeartHandshake,
    },
  ];

  const quickActions = [
    {
      key: 'basic' as const,
      label: 'ข้อมูลพื้นฐาน & PDPA',
      icon: UserCheck,
      iconColor: 'bg-[#EFF6FF] text-[#1D4ED8]',
      onClick: () => onSelectSection('basic'),
    },
    {
      key: 'application' as const,
      label: 'ยื่นใบสมัครทุน',
      icon: FileSpreadsheet,
      iconColor: 'bg-[#F8ECED] text-[#7A1629]',
      onClick: () => onSelectSection('application'),
    },
    {
      key: 'grades' as const,
      label: 'บันทึกผลการเรียน',
      icon: GraduationCap,
      iconColor: 'bg-[#FFFBEB] text-[#B45309]',
      onClick: () => onSelectSection('grades'),
    },
    {
      key: 'progress' as const,
      label: 'ความคืบหน้าทุน',
      icon: TrendingUp,
      iconColor: 'bg-[#ECFDF5] text-[#15803D]',
      onClick: () => onSelectSection('progress'),
    },
    {
      key: 'volunteer' as const,
      label: 'ระบบจิตอาสา',
      icon: volunteerUnlocked ? Unlock : Lock,
      iconColor: 'bg-[#F5F3FF] text-[#6D28D9]',
      onClick: () => onSelectSection('volunteer'),
    },
    {
      key: 'print-pdf' as const,
      label: 'พิมพ์ PDF โปรไฟล์',
      icon: Printer,
      iconColor: 'bg-[#FDF6E4] text-[#9A6E14]',
      onClick: () => setShowPrintModal(true),
    },
  ];

  const meta = SECTION_META[activeSection];

  return (
    <DashboardShell
      user={user}
      profilePhotoUrl={basicInfo.profilePhoto?.url || null}
      pageTitle={meta.title}
      breadcrumb={meta.breadcrumb}
      activeNavKey={activeSection}
      navGroups={navGroups}
      onSelectNav={(key) => onSelectSection(key as StudentSectionKey)}
      onGoHome={() => onSelectSection('home')}
      onLogout={onLogout}
      mobileMenuOpen={mobileMenuOpen}
      onSetMobileMenuOpen={setMobileMenuOpen}
      topRightSlot={
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center rounded-xl border border-[#DFD1BA] bg-[#FAF6EE] px-3 py-1.5 text-xs font-medium text-[#5A4B4E] tabular-nums">
            ปีการศึกษา {basicInfo.academicYear} · {basicInfo.yearLevel}
          </span>
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A1629] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#5B0F1D] transition-colors whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>พิมพ์โปรไฟล์ PDF</span>
          </button>
        </div>
      }
    >
      {statusBanner && (
        <div
          role="status"
          className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[#86EFAC] bg-[#F0FDF4] px-4 py-3 text-sm font-medium text-[#166534]"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{statusBanner}</span>
          </span>
          {onDismissStatusBanner && (
            <button
              type="button"
              onClick={onDismissStatusBanner}
              className="text-xs font-semibold underline hover:text-[#14532D]"
            >
              ปิด
            </button>
          )}
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
          {activeSection === 'password' && (
            <ChangePasswordPanel
              mode="self"
              user={user}
              onPasswordChanged={(updatedUser) => {
                onUpdateBundle({ ...bundle, user: updatedUser });
              }}
            />
          )}
          {activeSection === 'basic' && (
            <StudentBasicInfoForm
              basicInfo={basicInfo}
              onUpdated={handleBasicUpdated}
              onGoToApplication={() => onSelectSection('application')}
              onDeleteAccount={onDeleteAccount}
            />
          )}

          {activeSection === 'application' && (
            <StudentApplicationForm
              studentUserId={user.id}
              basicInfo={basicInfo}
              existingApplication={application}
              onSaved={handleApplicationSaved}
            />
          )}

          {activeSection === 'grades' && (
            <StudentGradesView
              grades={grades}
              defaultAcademicYear={basicInfo.academicYear}
              defaultYearLevel={basicInfo.yearLevel}
              onGradeSaved={handleGradeSaved}
            />
          )}

          {activeSection === 'progress' && (
            <StudentProgressView
              basicInfo={basicInfo}
              application={application}
              grades={grades}
              volunteers={volunteers}
              onNavigate={onSelectSection}
            />
          )}

          {activeSection === 'volunteer' && (
            <StudentVolunteerView
              application={application}
              volunteers={volunteers}
              defaultAcademicYear={basicInfo.academicYear}
              onVolunteerAdded={handleVolunteerAdded}
              onGoToProgress={() => onSelectSection('progress')}
            />
          )}

          {activeSection === 'home' && (
            <div className="space-y-6">
              {/* Row 1: 4 KPI Cards */}
              <section
                aria-label="สรุปข้อมูลทุนการศึกษาของฉัน"
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
              >
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
                        <p
                          className={`font-display font-bold text-[#23181A] tabular-nums leading-snug ${
                            card.value.length > 14 ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'
                          }`}
                        >
                          {card.value}
                        </p>
                        <p className="text-xs text-[#66585B] leading-snug">{card.meta}</p>
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* Row 2: 12-Col Progress Tracker (7) + 6-Tile Quick Actions (5) */}
              <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7 rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-5 surface-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-bold text-[#23181A]">
                        ความคืบหน้าการดำเนินการขอรับทุนการศึกษา
                      </h2>
                      <p className="text-xs text-[#66585B]">
                        สวัสดี {basicInfo.fullName || user.fullName} · ตรวจสอบสถานะทีละขั้นตอน
                      </p>
                    </div>
                    <span className="rounded-lg bg-[#FDF8EC] border border-[#DFC9A1] px-2.5 py-1 text-xs font-semibold text-[#7A1629] tabular-nums">
                      {completedCount}/4 ขั้นตอน ({progressPct}%)
                    </span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F2E9D8]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#7A1629] to-[#C6922C] transition-all duration-300"
                      style={{ width: `${Math.max(8, progressPct)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {checklistSteps.map((step, index) => (
                      <button
                        key={step.label}
                        type="button"
                        onClick={() => onSelectSection(step.key)}
                        className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                          step.done
                            ? 'border-[#BBF7D0] bg-[#F0FDF4]/80 hover:border-[#86EFAC]'
                            : 'border-[#EAE0CE] bg-[#FAF6EE]/70 hover:border-[#7A1629]/45'
                        }`}
                      >
                        <CheckCircle2
                          className={`h-5 w-5 shrink-0 ${
                            step.done ? 'text-[#16A34A]' : 'text-[#9CA3AF]'
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-[#66585B]">
                            ขั้นตอนที่ {index + 1}
                          </p>
                          <p className="text-xs sm:text-sm font-semibold text-[#23181A] truncate">
                            {step.label}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {application?.advisorComment && (
                    <div className="rounded-xl border border-[#DFC9A1] bg-[#FDF8EC] p-4 space-y-1">
                      <p className="text-xs font-semibold text-[#7A1629]">
                        ความคิดเห็นจากอาจารย์ประจำสาขา
                      </p>
                      <p className="text-sm text-[#23181A]">{application.advisorComment}</p>
                    </div>
                  )}

                  <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/70 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7A1629]">
                        <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>ทุนการศึกษาที่ได้รับ ({myScholarships.length} รายการ)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectSection('basic')}
                        className="text-xs font-medium text-[#7A1629] hover:underline"
                      >
                        แก้ไขในข้อมูลพื้นฐาน
                      </button>
                    </div>
                    {myScholarships.length === 0 ? (
                      <p className="text-xs text-[#66585B]">
                        ยังไม่มีรายการทุนการศึกษาที่ระบุไว้ (หากได้รับทุนสามารถเพิ่มได้ไม่จำกัดในหน้าข้อมูลพื้นฐาน)
                      </p>
                    ) : (
                      <ul className="space-y-1 text-xs text-[#23181A] list-disc pl-5">
                        {myScholarships.map((s) => (
                          <li key={s.id}>
                            <span className="font-semibold">{s.name}</span>
                            {s.provider ? (
                              <span className="text-[#66585B]"> — {s.provider}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* 6-Tile Quick Actions (Matching Reference Image Bottom-Right Grid) */}
                <div className="xl:col-span-5 rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#23181A]">เมนูด่วน</h2>
                    <span className="text-xs text-[#66585B]">คลิกเพื่อเปิดส่วนงาน</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {quickActions.map((qa) => {
                      const Icon = qa.icon;
                      return (
                        <button
                          key={qa.key}
                          type="button"
                          onClick={qa.onClick}
                          className="group rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/55 p-4 flex flex-col items-center justify-center gap-2.5 text-center hover:border-[#7A1629] hover:bg-white transition-all"
                        >
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-xl ${qa.iconColor} transition-transform group-hover:scale-105`}
                          >
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <span className="text-xs font-semibold text-[#23181A] leading-tight">
                            {qa.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Row 3: Submitted Grades & Volunteer Summary Table */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#23181A]">
                      ประวัติผลการเรียนที่บันทึกไว้
                    </h2>
                    <button
                      type="button"
                      onClick={() => onSelectSection('grades')}
                      className="text-xs font-medium text-[#7A1629] hover:underline"
                    >
                      จัดการผลการเรียน
                    </button>
                  </div>
                  {grades.length === 0 ? (
                    <p className="text-sm text-[#66585B] py-4">
                      ยังไม่มีข้อมูลใบแสดงผลการเรียน — กดที่เมนู &quot;3. ผลการเรียน&quot; เพื่อบันทึกเกรดภาค 1 และ 2
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-[#EAE0CE] text-[#66585B]">
                            <th className="py-2 pr-3 font-medium">ปีการศึกษา</th>
                            <th className="py-2 pr-3 font-medium">ชั้นปี</th>
                            <th className="py-2 pr-3 font-medium">ภาคเรียน</th>
                            <th className="py-2 text-right font-medium">GPA</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0E8D8] tabular-nums">
                          {grades.map((g) => (
                            <tr key={g.id}>
                              <td className="py-2.5 pr-3">{g.academicYear}</td>
                              <td className="py-2.5 pr-3">{g.yearLevel}</td>
                              <td className="py-2.5 pr-3">{g.semester}</td>
                              <td className="py-2.5 text-right font-semibold text-[#7A1629]">
                                {g.gpa}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#23181A]">
                      กิจกรรมจิตอาสาล่าสุด
                    </h2>
                    <button
                      type="button"
                      onClick={() => onSelectSection('volunteer')}
                      className="text-xs font-medium text-[#7A1629] hover:underline"
                    >
                      ดูทั้งหมด
                    </button>
                  </div>
                  {volunteers.length === 0 ? (
                    <p className="text-sm text-[#66585B] py-4">
                      {volunteerUnlocked
                        ? 'ยังไม่มีรายการบันทึกกิจกรรมจิตอาสา — เริ่มบันทึกกิจกรรมแรกได้เลย'
                        : 'ระบบจิตอาสาจะเปิดให้บันทึกกิจกรรมเมื่อคำร้องขอรับทุนได้รับการอนุมัติแล้ว'}
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {volunteers.slice(0, 4).map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 px-3.5 py-2.5 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#23181A] truncate">
                              {v.activityTitle}
                            </p>
                            <p className="text-[#66585B] tabular-nums">
                              วันที่ {v.activityDate} · {v.hours} ชม.
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 font-medium ${
                              v.approvalStatus === 'approved'
                                ? 'bg-[#ECFDF5] text-[#15803D]'
                                : v.approvalStatus === 'rejected'
                                  ? 'bg-[#FEF2F2] text-[#B91C1C]'
                                  : 'bg-[#FFFBEB] text-[#B45309]'
                            }`}
                          >
                            {v.approvalStatus === 'approved'
                              ? 'อนุมัติแล้ว'
                              : v.approvalStatus === 'rejected'
                                ? 'ไม่อนุมัติ'
                                : 'รออนุมัติ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {showPrintModal && (
        <StudentProfilePrintView
          record={bundle}
          currentUser={user}
          teacherNames={teacherNames}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </DashboardShell>
  );
}
