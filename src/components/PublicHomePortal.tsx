import { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  LogIn,
  PieChart,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../services/api';
import type {
  AcademicYear,
  PublicOverviewStats,
  UserRole,
  YearLevel,
} from '../types/scholarship';
import { ACADEMIC_YEARS, YEAR_LEVELS } from '../utils/scholarshipLogic';
import { DashboardShell, type SidebarNavGroup } from './DashboardShell';
import { ScholarshipSummarySection } from './ScholarshipSummarySection';

export type PublicHomeTab = 'overview' | 'manual' | 'forms' | 'calendar';

interface PublicHomePortalProps {
  activeTab: PublicHomeTab;
  onSelectTab: (tab: PublicHomeTab) => void;
  mobileMenuOpen: boolean;
  onSetMobileMenuOpen: (open: boolean) => void;
  adminInitialized: boolean;
  onNavigateAuth: (
    role: UserRole,
    studentMode?: 'login' | 'register'
  ) => void;
}

const EMPTY_OVERVIEW: PublicOverviewStats = {
  totalAllStudents: 0,
  filteredTotal: 0,
  approvedCount: 0,
  pendingCount: 0,
  needsRevisionOrRejectedCount: 0,
  draftOrNoAppCount: 0,
  loanCount: 0,
  pdpaConsentedCount: 0,
  gradeRecordsCount: 0,
  averageGpax: '0.00',
  approvedVolunteerHours: 0,
  pendingVolunteerHours: 0,
  yearLevelCounts: YEAR_LEVELS.map((yearLevel) => ({ yearLevel, total: 0 })),
  academicYearCounts: [
    { academicYear: '2569', count: 0 },
    { academicYear: '2570', count: 0 },
  ],
  byYearLevel: YEAR_LEVELS.map((yearLevel) => ({
    yearLevel,
    total: 0,
    approved: 0,
    pending: 0,
    draft: 0,
    loanCount: 0,
  })),
  scholarshipSummary: [],
};

const TAB_TITLES: Record<PublicHomeTab, { title: string; breadcrumb: string }> = {
  overview: {
    title: 'Dashboard',
    breadcrumb: 'ภาพรวมข้อมูลทุนการศึกษา & กยศ.',
  },
  manual: {
    title: 'คู่มือทุนการศึกษา & กยศ.',
    breadcrumb: 'ขั้นตอนการสมัครและใช้งานระบบ',
  },
  forms: {
    title: 'แบบฟอร์ม & เอกสารแนบ',
    breadcrumb: 'รายการเอกสารที่ต้องเตรียม',
  },
  calendar: {
    title: 'กำหนดการ & ปฏิทินทุน',
    breadcrumb: 'ระยะเวลาการดำเนินงานรายปี',
  },
};

const BAR_COLORS = [
  'from-[#7A1629] to-[#9B2339]',
  'from-[#2563EB] to-[#3B82F6]',
  'from-[#0D9488] to-[#14B8A6]',
  'from-[#C6922C] to-[#DFAB43]',
];

export function PublicHomePortal({
  activeTab,
  onSelectTab,
  mobileMenuOpen,
  onSetMobileMenuOpen,
  adminInitialized,
  onNavigateAuth,
}: PublicHomePortalProps) {
  const [academicYear, setAcademicYear] = useState<AcademicYear | 'all'>('all');
  const [yearLevel, setYearLevel] = useState<YearLevel | 'all'>('all');
  const [overview, setOverview] = useState<PublicOverviewStats>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<'stacked' | 'total' | 'table'>('stacked');
  const [ratioUnit, setRatioUnit] = useState<'count' | 'percent'>('count');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getPublicOverview(academicYear, yearLevel)
      .then((res) => {
        if (!cancelled) {
          setOverview(res.overview);
        }
      })
      .catch(() => {
        // Keep current fallback stats if request fails
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academicYear, yearLevel]);

  const approvedRate =
    overview.filteredTotal > 0
      ? Math.round((overview.approvedCount / overview.filteredTotal) * 100)
      : 0;
  const loanRate =
    overview.filteredTotal > 0
      ? Math.round((overview.loanCount / overview.filteredTotal) * 100)
      : 0;
  const maxBucketTotal = Math.max(
    1,
    ...overview.byYearLevel.map((b) => Math.max(b.total, 1))
  );

  // Donut Chart Calculations (SVG stroke-dasharray)
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const totalForDonut = Math.max(1, overview.filteredTotal);
  const draftAndRevCount =
    overview.draftOrNoAppCount + overview.needsRevisionOrRejectedCount;
  const donutSegments = [
    {
      label: 'อนุมัติทุนแล้ว',
      count: overview.approvedCount,
      color: '#16A34A',
    },
    {
      label: 'รอพิจารณา',
      count: overview.pendingCount,
      color: '#D97706',
    },
    {
      label: 'ฉบับร่าง / ขอแก้ไข',
      count: draftAndRevCount,
      color: '#CBD5E1',
    },
  ];

  let cumulativeOffset = 0;
  const donutArcs = donutSegments.map((seg) => {
    const fraction = overview.filteredTotal > 0 ? seg.count / totalForDonut : 0;
    const strokeLength = fraction * circumference;
    const offset = -cumulativeOffset;
    cumulativeOffset += strokeLength;
    return {
      ...seg,
      pct: Math.round(fraction * 100),
      strokeDasharray: `${strokeLength} ${circumference}`,
      strokeDashoffset: offset,
    };
  });

  const navGroups: SidebarNavGroup[] = [
    {
      title: 'เมนูหลัก',
      items: [
        { key: 'overview', label: 'ภาพรวม (Dashboard)', icon: LayoutDashboard },
        { key: 'manual', label: 'คู่มือทุนการศึกษา & กยศ.', icon: BookOpen },
        { key: 'forms', label: 'แบบฟอร์ม & เอกสารแนบ', icon: FileText },
        { key: 'calendar', label: 'กำหนดการ & ปฏิทินทุน', icon: CalendarDays },
      ],
    },
    {
      title: 'เข้าสู่ระบบ / สมัครสมาชิก',
      items: [
        { key: 'auth-student-login', label: 'นักศึกษา (รหัสนักศึกษา)', icon: GraduationCap },
        { key: 'auth-student-register', label: 'สมัครด้วยรหัสนักศึกษา', icon: UserPlus },
        { key: 'auth-teacher', label: 'เข้าสู่ระบบ (อาจารย์)', icon: UserCog },
        {
          key: 'auth-admin',
          label: adminInitialized ? 'เข้าสู่ระบบ (ผู้ดูแลระบบ)' : 'ตั้งค่าผู้ดูแลระบบครั้งแรก',
          icon: ShieldCheck,
        },
      ],
    },
  ];

  const handleSelectNav = (key: string) => {
    if (key === 'auth-student-login') {
      onNavigateAuth('student', 'login');
      return;
    }
    if (key === 'auth-student-register') {
      onNavigateAuth('student', 'register');
      return;
    }
    if (key === 'auth-teacher') {
      onNavigateAuth('teacher');
      return;
    }
    if (key === 'auth-admin') {
      onNavigateAuth('admin');
      return;
    }
    onSelectTab(key as PublicHomeTab);
  };

  const kpiCards = [
    {
      title: 'นักศึกษาในระบบทั้งหมด',
      value: `${overview.filteredTotal.toLocaleString()} คน`,
      meta: `ทั้งหมด ${overview.totalAllStudents} คน · ยืนยัน PDPA ${overview.pdpaConsentedCount} คน`,
      iconBg: 'bg-[#F8ECED] text-[#7A1629]',
      icon: Users,
    },
    {
      title: 'อนุมัติทุนการศึกษาแล้ว',
      value: `${overview.approvedCount.toLocaleString()} คน`,
      meta: `คิดเป็น ${approvedRate}% · เปิดระบบจิตอาสาแล้ว`,
      iconBg: 'bg-[#ECFDF5] text-[#15803D]',
      icon: UserCheck,
    },
    {
      title: 'รอพิจารณา / ตรวจสอบ',
      value: `${overview.pendingCount.toLocaleString()} รายการ`,
      meta: `ขอแก้ไข ${overview.needsRevisionOrRejectedCount} · ฉบับร่าง ${overview.draftOrNoAppCount}`,
      iconBg: 'bg-[#FFFBEB] text-[#B45309]',
      icon: Clock,
    },
    {
      title: 'ผู้กู้ยืม กยศ. / จิตอาสา',
      value: `${overview.loanCount.toLocaleString()} คน`,
      meta: `${loanRate}% กู้ กยศ. · จิตอาสาอนุมัติ ${overview.approvedVolunteerHours} ชม.`,
      iconBg: 'bg-[#EFF6FF] text-[#1D4ED8]',
      icon: Wallet,
    },
  ];

  const titleMeta = TAB_TITLES[activeTab];

  return (
    <DashboardShell
      user={null}
      pageTitle={titleMeta.title}
      breadcrumb={titleMeta.breadcrumb}
      activeNavKey={activeTab}
      navGroups={navGroups}
      onSelectNav={handleSelectNav}
      onGoHome={() => {
        onSelectTab('overview');
        setYearLevel('all');
        setAcademicYear('all');
      }}
      mobileMenuOpen={mobileMenuOpen}
      onSetMobileMenuOpen={onSetMobileMenuOpen}
      topRightSlot={
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'overview' && (
            <>
              <label htmlFor="overview-year-select" className="sr-only">
                เลือกปีการศึกษา
              </label>
              <select
                id="overview-year-select"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value as AcademicYear | 'all')}
                className="rounded-xl border border-[#DFD1BA] bg-[#FAF6EE] px-3 py-1.5 text-xs sm:text-sm font-medium text-[#23181A]"
              >
                <option value="all">ทุกปีการศึกษา ({overview.totalAllStudents} คน)</option>
                {ACADEMIC_YEARS.map((yr) => (
                  <option key={yr} value={yr}>
                    ปีการศึกษา {yr}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => onNavigateAuth('student', 'login')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A1629] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#5B0F1D] transition-colors whitespace-nowrap"
          >
            <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>เข้าสู่ระบบ</span>
          </button>
        </div>
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-6"
        >
          {activeTab === 'overview' && (
            <>
              {!adminInitialized && (
                <section className="rounded-2xl border border-[#C6922C]/70 bg-white p-5 flex flex-wrap items-center justify-between gap-4 surface-card">
                  <div className="space-y-1">
                    <h2 className="font-display text-base font-bold text-[#7A1629]">
                      เปิดใช้งานระบบครั้งแรก: ยังไม่ได้ตั้งค่าบัญชีผู้ดูแลระบบ
                    </h2>
                    <p className="text-xs sm:text-sm text-[#5A4B4E]">
                      กรุณาสร้างบัญชีผู้ดูแลระบบหลักคนแรกเพื่อจัดการรายชื่อนักศึกษา นำเข้า Excel อนุมัติทุน และดูแลบัญชีผู้ใช้งาน
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('admin')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5B0F1D] transition-colors"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      <span>ตั้งค่าผู้ดูแลระบบครั้งแรก</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('student', 'register')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#C6922C] bg-[#FDF8EC] px-4 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#F7EBCB] transition-colors"
                    >
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                      <span>สมัครด้วยรหัสนักศึกษา</span>
                    </button>
                  </div>
                </section>
              )}

              {/* 4 KPI Cards Row (Matching Reference Dashboard Structure) */}
              <section
                aria-label="ตัวชี้วัดภาพรวมทุนการศึกษา"
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
                        <p className="text-xs font-medium text-[#66585B] truncate">{card.title}</p>
                        <p className="font-display text-2xl font-bold tracking-tight text-[#23181A] tabular-nums">
                          {loading ? '—' : card.value}
                        </p>
                        <p className="text-xs text-[#66585B] leading-snug">{card.meta}</p>
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* 12-Col Analytics Grid: Bar Chart (5) + Donut Chart (4) + Summary/Quick Start (3) */}
              <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                {/* Bar Chart: Year Level Breakdown */}
                <div className="xl:col-span-5 rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-[#7A1629]">
                        <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <h2 className="font-display text-sm sm:text-base font-bold text-[#23181A]">
                          นักศึกษาแยกตามชั้นปี (ปี 1 - ปี 4)
                        </h2>
                      </div>
                      <p className="text-xs text-[#66585B]">คลิกแท่งกราฟเพื่อกรองชั้นปีที่แสดงผล</p>
                    </div>

                    <div className="inline-flex rounded-xl bg-[#F3ECDF] p-1">
                      <button
                        type="button"
                        onClick={() => setChartMode('stacked')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                          chartMode === 'stacked'
                            ? 'bg-[#7A1629] text-white'
                            : 'text-[#5A4B4E] hover:text-[#7A1629]'
                        }`}
                      >
                        แยกสถานะ
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartMode('total')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                          chartMode === 'total'
                            ? 'bg-[#7A1629] text-white'
                            : 'text-[#5A4B4E] hover:text-[#7A1629]'
                        }`}
                      >
                        แท่งรวม
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartMode('table')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                          chartMode === 'table'
                            ? 'bg-[#7A1629] text-white'
                            : 'text-[#5A4B4E] hover:text-[#7A1629]'
                        }`}
                      >
                        ตาราง
                      </button>
                    </div>
                  </div>

                  {chartMode === 'table' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#E6DAC5] text-[#66585B]">
                            <th className="py-2 pr-2 font-medium">ชั้นปี</th>
                            <th className="py-2 px-2 text-right font-medium">ทั้งหมด</th>
                            <th className="py-2 px-2 text-right font-medium">อนุมัติ</th>
                            <th className="py-2 px-2 text-right font-medium">รอพิจารณา</th>
                            <th className="py-2 pl-2 text-right font-medium">กยศ.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFE5D4] tabular-nums">
                          {overview.byYearLevel.map((row) => (
                            <tr key={row.yearLevel} className="hover:bg-[#FAF6EE]">
                              <td className="py-2.5 pr-2 font-medium text-[#23181A]">
                                {row.yearLevel}
                              </td>
                              <td className="py-2.5 px-2 text-right font-semibold text-[#7A1629]">
                                {row.total}
                              </td>
                              <td className="py-2.5 px-2 text-right text-[#15803D]">
                                {row.approved}
                              </td>
                              <td className="py-2.5 px-2 text-right text-[#B45309]">
                                {row.pending}
                              </td>
                              <td className="py-2.5 pl-2 text-right text-[#1D4ED8]">
                                {row.loanCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#5A4B4E]">
                        {chartMode === 'stacked' ? (
                          <>
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
                          </>
                        ) : (
                          <span className="text-xs text-[#66585B]">
                            แสดงจำนวนนักศึกษาทั้งหมดแยกตามชั้นปี
                          </span>
                        )}
                        {yearLevel !== 'all' && (
                          <button
                            type="button"
                            onClick={() => setYearLevel('all')}
                            className="ml-auto text-xs font-medium text-[#7A1629] hover:underline"
                          >
                            แสดงทุกชั้นปี
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-3 items-end h-52 border-b border-[#E6DAC5] pt-6 px-1">
                        {overview.byYearLevel.map((bucket, idx) => {
                          const heightPct = Math.round((bucket.total / maxBucketTotal) * 100);
                          const approvedPct =
                            bucket.total > 0
                              ? Math.round((bucket.approved / bucket.total) * 100)
                              : 0;
                          const pendingPct =
                            bucket.total > 0
                              ? Math.round((bucket.pending / bucket.total) * 100)
                              : 0;
                          const isSelected = yearLevel === bucket.yearLevel;

                          return (
                            <button
                              key={bucket.yearLevel}
                              type="button"
                              onClick={() =>
                                setYearLevel(isSelected ? 'all' : bucket.yearLevel)
                              }
                              className="group flex flex-col items-center justify-end h-full gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-[#7A1629]"
                            >
                              <span className="text-xs font-semibold text-[#23181A] tabular-nums">
                                {bucket.total}
                              </span>
                              <div className="w-full max-w-[46px] h-36 flex items-end justify-center">
                                {bucket.total > 0 ? (
                                  <div
                                    style={{ height: `${Math.max(heightPct, 14)}%` }}
                                    className={`w-full rounded-t-lg overflow-hidden flex flex-col-reverse border transition-transform duration-200 group-hover:scale-[1.03] ${
                                      isSelected
                                        ? 'border-[#7A1629] ring-2 ring-[#C6922C]/45'
                                        : 'border-transparent'
                                    }`}
                                  >
                                    {chartMode === 'stacked' ? (
                                      <>
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
                                      </>
                                    ) : (
                                      <div
                                        className={`w-full h-full bg-gradient-to-t ${
                                          BAR_COLORS[idx % BAR_COLORS.length]
                                        }`}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-full h-1.5 rounded-t bg-[#EFE5D4]" />
                                )}
                              </div>
                              <span
                                className={`pb-2 text-xs font-medium ${
                                  isSelected ? 'text-[#7A1629] font-semibold' : 'text-[#5A4B4E]'
                                }`}
                              >
                                {bucket.yearLevel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* SVG Donut Chart: Scholarship Status Distribution */}
                <div className="xl:col-span-4 rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-[#7A1629]">
                        <PieChart className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <h2 className="font-display text-sm sm:text-base font-bold text-[#23181A]">
                          สัดส่วนสถานะการขอทุน
                        </h2>
                      </div>
                      <p className="text-xs text-[#66585B]">แสดงสถานะคำร้องทั้งหมด</p>
                    </div>

                    <div className="inline-flex rounded-xl bg-[#F3ECDF] p-1">
                      <button
                        type="button"
                        onClick={() => setRatioUnit('count')}
                        className={`rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                          ratioUnit === 'count'
                            ? 'bg-[#7A1629] text-white'
                            : 'text-[#5A4B4E] hover:text-[#7A1629]'
                        }`}
                      >
                        จำนวน
                      </button>
                      <button
                        type="button"
                        onClick={() => setRatioUnit('percent')}
                        className={`rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                          ratioUnit === 'percent'
                            ? 'bg-[#7A1629] text-white'
                            : 'text-[#5A4B4E] hover:text-[#7A1629]'
                        }`}
                      >
                        %
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-5 py-2">
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
                        {overview.filteredTotal > 0 &&
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
                          {overview.filteredTotal}
                        </span>
                        <span className="text-[11px] text-[#66585B]">คน</span>
                      </div>
                    </div>

                    <div className="w-full space-y-3">
                      {donutArcs.map((arc) => (
                        <div key={arc.label} className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-2 text-[#4B3F42]">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: arc.color }}
                            />
                            <span>{arc.label}</span>
                          </span>
                          <span className="font-semibold text-[#23181A] tabular-nums">
                            {ratioUnit === 'count' ? `${arc.count} คน` : `${arc.pct}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Card: Academic & Volunteer Highlights + Auth Entry */}
                <div className="xl:col-span-3 rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 flex flex-col justify-between gap-4 surface-card">
                  <div className="space-y-4">
                    <h2 className="font-display text-sm sm:text-base font-bold text-[#23181A]">
                      ผลการเรียน &amp; จิตอาสา
                    </h2>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl border border-[#EFE5D4] bg-[#FAF6EE]/80 p-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF6E4] text-[#9A6E14]">
                          <GraduationCap className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-[11px] text-[#66585B]">เกรดเฉลี่ยสะสม (GPAX)</p>
                          <p className="font-display text-lg font-bold text-[#23181A] tabular-nums">
                            {overview.averageGpax}
                          </p>
                          <p className="text-[11px] text-[#66585B] tabular-nums">
                            บันทึกแล้ว {overview.gradeRecordsCount} ภาคเรียน
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 rounded-xl border border-[#EFE5D4] bg-[#FAF6EE]/80 p-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5F3FF] text-[#6D28D9]">
                          <HeartHandshake className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-[11px] text-[#66585B]">ชั่วโมงจิตอาสา (อนุมัติ)</p>
                          <p className="font-display text-lg font-bold text-[#23181A] tabular-nums">
                            {overview.approvedVolunteerHours} ชม.
                          </p>
                          <p className="text-[11px] text-[#66585B] tabular-nums">
                            รออนุมัติ {overview.pendingVolunteerHours} ชม.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#EFE5D4] pt-4 space-y-2">
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('student', 'login')}
                      className="w-full rounded-xl bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5B0F1D] transition-colors"
                    >
                      เข้าสู่ระบบด้วยรหัสนักศึกษา
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('student', 'register')}
                      className="w-full rounded-xl border border-[#C6922C] bg-[#FDF8EC] px-4 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#F7EBCB] transition-colors"
                    >
                      สมัครด้วยรหัสนักศึกษา
                    </button>
                  </div>
                </div>
              </section>

              <ScholarshipSummarySection
                summary={overview.scholarshipSummary || []}
                loading={loading}
              />
            </>
          )}

          {activeTab === 'manual' && (
            <section className="rounded-2xl border border-[#DFD1BA] bg-white p-6 sm:p-8 space-y-6 surface-card">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EFE5D4] pb-4">
                <div className="space-y-1">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#7A1629]">
                    คู่มือการใช้งานระบบทุนการศึกษา &amp; กยศ.
                  </h2>
                  <p className="text-sm text-[#66585B]">
                    ขั้นตอนการลงทะเบียนและการยื่นขอรับทุนการศึกษาสำหรับนักศึกษาสาขาวิชาสังคมศึกษา
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateAuth('student', 'register')}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#7A1629] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D] transition-colors whitespace-nowrap"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  <span>สมัครสมาชิกด้วยรหัสนักศึกษา</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    step: '01. สมัครและยืนยันตัวตน',
                    detail:
                      'ใช้รหัสนักศึกษา 8 หลักเป็นทั้งชื่อผู้ใช้งานและรหัสผ่านเริ่มต้น จากนั้นตั้งรหัสผ่านใหม่ที่ปลอดภัยทันทีในการเข้าใช้งานครั้งแรก',
                  },
                  {
                    step: '02. ยินยอม PDPA & ข้อมูลพื้นฐาน',
                    detail:
                      'อ่านนโยบายคุ้มครองข้อมูลส่วนบุคคล กรอกประวัติครอบครัว รายได้ผู้ปกครอง รูปติดบัตร 1.5 นิ้ว และภาพถ่ายบ้าน',
                  },
                  {
                    step: '03. ยื่นใบสมัครทุนการศึกษา',
                    detail:
                      'ระบบดึงข้อมูลพื้นฐานมาเติมให้อัตโนมัติ นักศึกษากรอกเหตุผลความจำเป็นและแนบภาพถ่ายประกอบคำขอทุน',
                  },
                  {
                    step: '04. บันทึกใบแสดงผลการเรียน',
                    detail:
                      'กรอกเกรดเฉลี่ยภาคเรียนที่ 1 และภาคเรียนที่ 2 แยกกัน พร้อมแนบไฟล์หลักฐานผลการศึกษาอย่างน้อย 2 ไฟล์',
                  },
                  {
                    step: '05. ติดตามความคืบหน้า & จิตอาสา',
                    detail:
                      'ตรวจสถานะพิจารณาจากอาจารย์ เมื่อได้รับอนุมัติทุนแล้ว ระบบบันทึกกิจกรรมและชั่วโมงจิตอาสาจะปลดล็อกให้อัตโนมัติ',
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="rounded-xl border border-[#E6DAC5] bg-[#FAF6EE]/70 p-5 space-y-2"
                  >
                    <h3 className="font-display text-base font-bold text-[#7A1629]">{item.step}</h3>
                    <p className="text-sm text-[#4B3F42] leading-relaxed">{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'forms' && (
            <section className="rounded-2xl border border-[#DFD1BA] bg-white p-6 sm:p-8 space-y-6 surface-card">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EFE5D4] pb-4">
                <div className="space-y-1">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#7A1629]">
                    แบบฟอร์ม &amp; รายการเอกสารที่ต้องเตรียม
                  </h2>
                  <p className="text-sm text-[#66585B]">
                    ตรวจสอบความพร้อมของเอกสารประกอบการสมัครทุนและการส่งผลการเรียนรายภาคเรียน
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateAuth('student', 'login')}
                  className="rounded-xl bg-[#7A1629] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D] transition-colors whitespace-nowrap"
                >
                  เข้าสู่ระบบเพื่อกรอกข้อมูลออนไลน์
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#E6DAC5] text-[#66585B]">
                      <th className="py-3 pr-4 font-semibold">รายการเอกสาร</th>
                      <th className="py-3 px-4 font-semibold">หมวดหมู่</th>
                      <th className="py-3 px-4 font-semibold">รูปแบบไฟล์ที่รองรับ</th>
                      <th className="py-3 pl-4 font-semibold">เงื่อนไขสำคัญ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE5D4]">
                    {[
                      {
                        name: 'รูปถ่ายนักศึกษาขนาด 1.5 นิ้ว',
                        cat: 'ข้อมูลพื้นฐาน',
                        fmt: 'JPG, PNG, WEBP (ไม่เกิน 5 MB)',
                        note: 'ใช้แสดงหน้าโปรไฟล์และแบบพิมพ์คำร้อง PDF',
                      },
                      {
                        name: 'ภาพถ่ายบ้านพักอาศัยและครอบครัว',
                        cat: 'สมัครทุนการศึกษา',
                        fmt: 'JPG, PNG, WEBP (ไม่เกิน 5 MB/รูป)',
                        note: 'แยกถ่ายในบ้าน-นอกบ้าน และภาพร่วมกับครอบครัว',
                      },
                      {
                        name: 'ใบแสดงผลการเรียน (ภาคเรียนที่ 1 และ 2)',
                        cat: 'ผลการเรียน',
                        fmt: 'PDF, JPG, PNG (ไม่เกิน 3 MB/ไฟล์)',
                        note: 'แนบอย่างน้อย 2 ไฟล์ต่อรายการ',
                      },
                      {
                        name: 'หลักฐานและภาพถ่ายกิจกรรมจิตอาสา',
                        cat: 'ระบบจิตอาสา',
                        fmt: 'JPG, PNG, WEBP (ไม่เกิน 10 MB/รูป)',
                        note: 'แนบอย่างน้อย 3 รูป (เปิดใช้งานหลังอนุมัติทุน)',
                      },
                    ].map((doc) => (
                      <tr key={doc.name} className="hover:bg-[#FAF6EE]">
                        <td className="py-3.5 pr-4 font-medium text-[#23181A]">
                          <span className="inline-flex items-center gap-2">
                            <CheckCircle2
                              className="h-4 w-4 text-[#16A34A] shrink-0"
                              aria-hidden="true"
                            />
                            <span>{doc.name}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-[#5A4B4E]">{doc.cat}</td>
                        <td className="py-3.5 px-4 text-[#5A4B4E] tabular-nums">{doc.fmt}</td>
                        <td className="py-3.5 pl-4 text-[#66585B]">{doc.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'calendar' && (
            <section className="rounded-2xl border border-[#DFD1BA] bg-white p-6 sm:p-8 space-y-6 surface-card">
              <div className="border-b border-[#EFE5D4] pb-4 space-y-1">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#7A1629]">
                  กำหนดการดำเนินงานทุนการศึกษา &amp; กยศ. (ปีการศึกษา 2569 – 2575)
                </h2>
                <p className="text-sm text-[#66585B]">
                  ลำดับช่วงเวลาการรับสมัคร การพิจารณาคัดเลือก และการรายงานชั่วโมงจิตอาสา
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    phase: 'ระยะที่ 1 · ลงทะเบียน & บันทึกข้อมูลพื้นฐาน',
                    desc: 'นักศึกษาเข้าสู่ระบบด้วยรหัสนักศึกษา ยืนยัน PDPA และกรอกข้อมูลพื้นฐานครอบครัวครบถ้วน',
                  },
                  {
                    phase: 'ระยะที่ 2 · ยื่นแบบฟอร์มขอรับทุนการศึกษา',
                    desc: 'บันทึกความจำเป็นและแนบภาพถ่ายที่อยู่อาศัย ส่งคำร้องเข้าสู่ระบบพิจารณาของอาจารย์ประจำสาขา',
                  },
                  {
                    phase: 'ระยะที่ 3 · อาจารย์พิจารณาคัดเลือก & แจ้งผล',
                    desc: 'อาจารย์ตรวจสอบเอกสาร แสดงความคิดเห็น หรือขอข้อมูลเพิ่มเติม และอนุมัติทุนการศึกษา',
                  },
                  {
                    phase: 'ระยะที่ 4 · บันทึกผลการเรียนรายภาค & จิตอาสา',
                    desc: 'นักศึกษาที่ได้รับทุนรายงานผล GPA ภาค 1–2 และบันทึกกิจกรรมจิตอาสาเพื่อสะสมชั่วโมง',
                  },
                ].map((item) => (
                  <div
                    key={item.phase}
                    className="rounded-xl border border-[#E6DAC5] bg-[#FAF6EE]/60 p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="font-display text-sm font-bold text-[#7A1629]">{item.phase}</p>
                      <p className="text-xs sm:text-sm text-[#4B3F42]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </motion.div>
      </AnimatePresence>
    </DashboardShell>
  );
}
