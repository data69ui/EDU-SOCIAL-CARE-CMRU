import { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  GraduationCap,
  Hash,
  HelpCircle,
  KeyRound,
  LogIn,
  RefreshCw,
  ShieldCheck,
  User,
  UserCheck,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../services/api';
import type { AcademicYear, UserAccount, UserRole, YearLevel } from '../types/scholarship';
import {
  ACADEMIC_YEARS,
  YEAR_LEVELS,
  evaluateAdminSetupPassword,
  generateVerificationCode,
  MIN_ADMIN_PASSWORD_LENGTH,
  validateAdminSetupPayload,
  validateStudentId,
  validateStudentRegistrationPayload,
  verifyVerificationCode,
} from '../utils/scholarshipLogic';

interface LoginPortalProps {
  adminInitialized: boolean;
  initialRole?: UserRole;
  initialStudentMode?: 'login' | 'register';
  onBackToOverview?: () => void;
  onAuthenticated: (user: UserAccount) => void;
  onAdminInitialized: () => void;
}

export function LoginPortal({
  adminInitialized,
  initialRole = 'student',
  initialStudentMode = 'login',
  onAuthenticated,
  onAdminInitialized,
}: LoginPortalProps) {
  const [activeRole, setActiveRole] = useState<UserRole>(initialRole);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);

  // Student states (Student ID + Password)
  const [studentMode, setStudentMode] = useState<'login' | 'register'>(
    initialStudentMode
  );
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentPasswordInput, setStudentPasswordInput] = useState('');
  const [showStudentPassword, setShowStudentPassword] = useState(false);

  // Student registration states
  const [regStudentId, setRegStudentId] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regYearLevel, setRegYearLevel] = useState<YearLevel>('ปี 1');
  const [regAcademicYear, setRegAcademicYear] = useState<AcademicYear>('2569');

  // Teacher states
  const [teacherMode, setTeacherMode] = useState<'login' | 'register'>('login');
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherFullName, setTeacherFullName] = useState('');
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);

  // Admin states
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);

  // 5-digit numeric verification challenge
  const [captchaCode, setCaptchaCode] = useState(() => generateVerificationCode(5));
  const [captchaInput, setCaptchaInput] = useState('');

  const refreshCaptcha = () => {
    setCaptchaCode(generateVerificationCode(5));
    setCaptchaInput('');
  };

  useEffect(() => {
    setActiveRole(initialRole);
    if (initialStudentMode) {
      setStudentMode(initialStudentMode);
    }
    setError(null);
    setShowForgotHelp(false);
    refreshCaptcha();
  }, [initialRole, initialStudentMode]);

  useEffect(() => {
    setError(null);
    refreshCaptcha();
  }, [adminInitialized]);

  const validateCaptchaOrError = (): boolean => {
    if (!verifyVerificationCode(captchaInput, captchaCode)) {
      setError('รหัสยืนยันตัวตน 5 หลักไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง');
      refreshCaptcha();
      return false;
    }
    return true;
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const check = validateStudentId(studentIdInput);
    if (!check.valid) {
      setError(check.error || 'กรุณากรอกรหัสนักศึกษาให้ถูกต้อง');
      return;
    }
    if (!studentPasswordInput) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setLoading(true);
    try {
      const res = await api.loginStudent({
        studentId: check.normalized,
        password: studentPasswordInput,
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const check = validateStudentRegistrationPayload({
      studentId: regStudentId,
      fullName: regFullName,
    });
    if (!check.valid) {
      setError(check.error || 'ข้อมูลสมัครสมาชิกไม่ถูกต้อง');
      return;
    }

    setLoading(true);
    try {
      const res = await api.registerStudentById({
        studentId: check.normalizedStudentId,
        fullName: regFullName.trim() || undefined,
        yearLevel: regYearLevel,
        academicYear: regAcademicYear,
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (teacherMode === 'login' && !validateCaptchaOrError()) return;

    setLoading(true);
    try {
      if (teacherMode === 'register') {
        const res = await api.registerTeacher({
          username: teacherUsername,
          password: teacherPassword,
          fullName: teacherFullName,
        });
        onAuthenticated(res.user);
      } else {
        const res = await api.loginPassword({
          role: 'teacher',
          username: teacherUsername,
          password: teacherPassword,
        });
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError((err as Error).message);
      if (teacherMode === 'login') refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!adminInitialized) {
      const check = validateAdminSetupPayload({
        fullName: adminFullName,
        username: adminUsername,
        password: adminPassword,
        confirmPassword: adminConfirmPassword,
      });
      if (!check.valid) {
        setError(check.error || 'กรุณาตรวจสอบข้อมูลผู้ดูแลระบบให้ครบถ้วน');
        return;
      }
    } else if (!validateCaptchaOrError()) {
      return;
    }

    setLoading(true);
    try {
      if (!adminInitialized) {
        const res = await api.setupFirstAdmin({
          username: adminUsername,
          password: adminPassword,
          confirmPassword: adminConfirmPassword,
          fullName: adminFullName,
        });
        onAdminInitialized();
        onAuthenticated(res.user);
      } else {
        const res = await api.loginPassword({
          role: 'admin',
          username: adminUsername,
          password: adminPassword,
        });
        onAuthenticated(res.user);
      }
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      if (!adminInitialized && msg.includes('ตั้งค่าครั้งแรกเรียบร้อยแล้ว')) {
        onAdminInitialized();
        refreshCaptcha();
      } else if (adminInitialized) {
        refreshCaptcha();
      }
    } finally {
      setLoading(false);
    }
  };

  const roleTabs = [
    { key: 'student' as const, label: 'นักศึกษา', icon: GraduationCap },
    { key: 'teacher' as const, label: 'อาจารย์', icon: UserCog },
    { key: 'admin' as const, label: 'ผู้ดูแลระบบ', icon: ShieldCheck },
  ];

  const getCardHeaderMeta = () => {
    if (activeRole === 'student') {
      if (studentMode === 'register') {
        return {
          title: 'สมัครสมาชิกนักศึกษา (รหัสนักศึกษา)',
          icon: UserPlus,
          gradient: 'from-[#0F5132] via-[#157347] to-[#198754]',
        };
      }
      return {
        title: 'เข้าสู่ระบบนักศึกษา (รหัสนักศึกษา & รหัสผ่าน)',
        icon: GraduationCap,
        gradient: 'from-[#5B0F1D] via-[#7A1629] to-[#961F36]',
      };
    }

    if (activeRole === 'teacher') {
      if (teacherMode === 'register') {
        return {
          title: 'สมัครสมาชิก (อาจารย์ประจำสาขา)',
          icon: UserPlus,
          gradient: 'from-[#0F5132] via-[#157347] to-[#198754]',
        };
      }
      return {
        title: 'เข้าสู่ระบบ (อาจารย์ประจำสาขา)',
        icon: UserCog,
        gradient: 'from-[#5B0F1D] via-[#7A1629] to-[#961F36]',
      };
    }

    if (!adminInitialized) {
      return {
        title: 'เปิดระบบครั้งแรก (ผู้ดูแลระบบ)',
        icon: ShieldCheck,
        gradient: 'from-[#7A4F0B] via-[#A16B14] to-[#C6922C]',
      };
    }

    return {
      title: 'เข้าสู่ระบบ (ผู้ดูแลระบบ)',
      icon: ShieldCheck,
      gradient: 'from-[#4A0B17] via-[#6B1022] to-[#87182E]',
    };
  };

  const headerMeta = getCardHeaderMeta();
  const HeaderIcon = headerMeta.icon;

  const renderVerificationChallenge = () => (
    <div className="space-y-2">
      <label htmlFor="login-captcha-input" className="block text-xs sm:text-sm font-medium text-[#23181A]">
        รหัสยืนยันตัวตน
      </label>
      <div className="flex items-center gap-3">
        <div
          aria-label={`รหัสยืนยันตัวตน ${captchaCode}`}
          className="inline-flex min-w-[116px] items-center justify-center rounded-xl border border-[#DFC9A1] bg-gradient-to-br from-[#FBF5E8] via-[#F2E5CB] to-[#EAD7B2] px-4 py-2 font-mono text-lg font-bold tracking-[0.26em] text-[#5B0F1D] italic select-none shadow-2xs tabular-nums"
        >
          {captchaCode}
        </div>
        <button
          type="button"
          onClick={refreshCaptcha}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D4BC] bg-[#FAF6EE] px-3 py-2 text-xs font-medium text-[#5A4B4E] hover:border-[#C6922C] hover:text-[#7A1629] transition-colors"
          title="สุ่มรหัสยืนยันตัวตนใหม่"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>ตัวเลข 5 หลัก</span>
        </button>
      </div>
      <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#7A1629] focus-within:ring-2 focus-within:ring-[#7A1629]/15">
        <span className="flex w-11 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#7A1629]">
          <Hash className="h-4 w-4" aria-hidden="true" />
        </span>
        <input
          id="login-captcha-input"
          type="text"
          inputMode="numeric"
          maxLength={5}
          required
          value={captchaInput}
          onChange={(e) => setCaptchaInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="ป้อนตัวเลขที่เห็นในภาพ"
          className="w-full bg-white px-3.5 py-2.5 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none tabular-nums"
        />
      </div>
    </div>
  );

  return (
    <main className="relative min-h-[calc(100vh-132px)] flex flex-col items-center justify-center px-4 py-3 sm:py-4 overflow-hidden bg-[radial-gradient(circle_at_15%_12%,rgba(122,22,41,0.10),transparent_40%),radial-gradient(circle_at_85%_18%,rgba(198,146,44,0.14),transparent_42%),radial-gradient(circle_at_50%_92%,rgba(22,163,74,0.06),transparent_45%)]">
      {/* Top Brand Lockup */}
      <div className="w-full max-w-[460px] text-center space-y-1.5 mb-3">
        <div className="inline-flex items-center justify-center rounded-2xl border border-[#DFD1BA] bg-white px-3.5 py-1 shadow-sm">
          <img
            src="/assets/aistudio/image_7437b452.png"
            alt="ตราสัญลักษณ์สาขาวิชาสังคมศึกษา CMRU"
            referrerPolicy="no-referrer"
            className="h-9 sm:h-10 w-auto object-contain"
          />
        </div>
        <div className="space-y-0.5">
          <h1 className="font-display text-lg font-bold tracking-tight text-[#6B1022]">
            ระบบงานทุนการศึกษา &amp; กยศ.
          </h1>
          <p className="text-xs text-[#5A4B4E]">
            สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
          </p>
        </div>
        <div className="mx-auto h-[3px] w-16 rounded-full bg-gradient-to-r from-[#7A1629] via-[#C6922C] to-[#7A1629]" />
      </div>

      {/* Centered Authentication Card */}
      <section className="w-full max-w-[460px] rounded-2xl border border-[#DFD1BA] bg-white shadow-xl shadow-[#7A1629]/10 overflow-hidden">
        {/* Colored Card Header Bar */}
        <div
          className={`bg-gradient-to-r ${headerMeta.gradient} border-b-2 border-[#C6922C] px-5 py-3 text-white transition-all duration-300`}
        >
          <div className="flex items-center justify-center gap-2.5 text-center">
            <HeaderIcon className="h-5 w-5 shrink-0 text-[#F5D98E]" aria-hidden="true" />
            <h2 className="font-display text-base sm:text-lg font-semibold tracking-tight">
              {headerMeta.title}
            </h2>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {!adminInitialized && activeRole !== 'admin' && (
            <div className="rounded-xl border border-[#C6922C]/70 bg-[#FDF8EC] px-4 py-3 text-xs text-[#5C410A]">
              <p className="font-display font-semibold text-[#7A1629]">
                เปิดใช้งานระบบครั้งแรก: กรุณาลงทะเบียนผู้ดูแลระบบก่อน
              </p>
              <p className="mt-0.5 leading-relaxed">
                เลือกแท็บ{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveRole('admin');
                    setError(null);
                  }}
                  className="font-semibold underline text-[#7A1629]"
                >
                  ผู้ดูแลระบบ
                </button>{' '}
                เพื่อสร้างบัญชีผู้ดูแลระบบคนแรก
              </p>
            </div>
          )}

          {/* 3-Role Segmented Selector */}
          <div
            role="tablist"
            aria-label="ประเภทผู้ใช้งาน"
            className="grid grid-cols-3 gap-1 rounded-xl border border-[#E8DBC6] bg-[#F4ECE0] p-1"
          >
            {roleTabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeRole === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveRole(tab.key);
                    setError(null);
                    setShowForgotHelp(false);
                    refreshCaptcha();
                  }}
                  className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    selected ? 'text-white' : 'text-[#5A4B4E] hover:text-[#7A1629]'
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="login-role-pill"
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#7A1629] to-[#961F36] shadow-xs"
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden="true" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-xs sm:text-sm text-[#991B1B]"
            >
              {error}
            </motion.div>
          )}

          {/* Role 1: Student (Student ID + Password) */}
          {activeRole === 'student' && (
            <div className="space-y-4">
              {studentMode === 'login' ? (
                <form onSubmit={handleStudentLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="stu-login-id" className="block text-xs sm:text-sm font-medium text-[#23181A]">
                      ชื่อผู้ใช้งาน (รหัสนักศึกษา) *
                    </label>
                    <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#7A1629] focus-within:ring-2 focus-within:ring-[#7A1629]/15">
                      <span className="flex w-11 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#7A1629]">
                        <GraduationCap className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <input
                        id="stu-login-id"
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        required
                        autoComplete="username"
                        value={studentIdInput}
                        onChange={(e) => setStudentIdInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="กรอกรหัสนักศึกษา 8 หลัก (เช่น 69xxxxxx)"
                        className="w-full bg-white px-3.5 py-2.5 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="stu-login-password" className="block text-xs sm:text-sm font-medium text-[#23181A]">
                      รหัสผ่าน (Password) *
                    </label>
                    <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#7A1629] focus-within:ring-2 focus-within:ring-[#7A1629]/15">
                      <span className="flex w-11 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#7A1629]">
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <input
                        id="stu-login-password"
                        type={showStudentPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={studentPasswordInput}
                        onChange={(e) => setStudentPasswordInput(e.target.value)}
                        placeholder="เข้าใช้งานครั้งแรกใช้รหัสนักศึกษา 8 หลัก"
                        className="w-full bg-white px-3.5 py-2.5 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStudentPassword((v) => !v)}
                        aria-label={showStudentPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        className="px-3 text-[#7A6B6E] hover:text-[#7A1629]"
                      >
                        {showStudentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#66585B]">
                      รหัสผ่านเริ่มต้นสำหรับนักศึกษาใหม่คือ <span className="font-semibold text-[#7A1629]">รหัสนักศึกษา 8 หลัก</span> (เช่น 69xxxxxx)
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6B1022] via-[#7A1629] to-[#961F36] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60"
                    >
                      <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {loading ? 'กำลังตรวจสอบข้อมูลเข้าสู่ระบบ...' : 'เข้าสู่ระบบนักศึกษา'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStudentMode('register');
                        if (studentIdInput.trim() && !regStudentId.trim()) {
                          setRegStudentId(studentIdInput.trim());
                        }
                        setError(null);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#16A34A] bg-white px-4 py-2.5 text-sm font-semibold text-[#15803D] hover:bg-[#ECFDF5] active:scale-[0.99] transition-all"
                    >
                      <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>สมัครสมาชิกด้วยรหัสนักศึกษา</span>
                    </button>

                    <div className="text-center pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowForgotHelp((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#5A4B4E] hover:text-[#7A1629] hover:underline"
                      >
                        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>ลืมรหัสผ่าน?</span>
                      </button>
                    </div>

                    {showForgotHelp && (
                      <div className="rounded-xl border border-[#DFC9A1] bg-[#FDF8EC] p-3 text-xs text-[#5C410A] leading-relaxed">
                        หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบหรืออาจารย์ผู้รับผิดชอบงานทุนการศึกษาเพื่อดำเนินการรีเซ็ตรหัสผ่าน
                        เมื่อรีเซ็ตแล้ว ระบบจะให้ตั้งรหัสผ่านใหม่ทันทีเมื่อเข้าสู่ระบบครั้งถัดไป
                      </div>
                    )}
                  </div>
                </form>
              ) : (
                <form onSubmit={handleStudentRegister} className="space-y-3.5">
                  <div className="rounded-xl border border-[#DFC9A1] bg-[#FDF8EC] px-3.5 py-2.5 text-xs text-[#5C410A] leading-relaxed">
                    ระบบจะสร้างบัญชีด้วยรหัสนักศึกษา 8 หลัก และกำหนดรหัสผ่านเริ่มต้นอัตโนมัติเป็น{' '}
                    <span className="font-semibold text-[#7A1629]">รหัสนักศึกษาของคุณ</span>{' '}
                    จากนั้นบังคับตั้งรหัสผ่านใหม่ที่ปลอดภัยทันทีเมื่อเข้าสู่ระบบ
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="stu-reg-id" className="block text-xs sm:text-sm font-medium text-[#23181A]">
                      รหัสนักศึกษา 8 หลัก *
                    </label>
                    <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#15803D] focus-within:ring-2 focus-within:ring-[#15803D]/15">
                      <span className="flex w-11 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#15803D]">
                        <GraduationCap className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <input
                        id="stu-reg-id"
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        required
                        value={regStudentId}
                        onChange={(e) => setRegStudentId(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="กรอกรหัสนักศึกษา 8 หลัก (เช่น 69xxxxxx)"
                        className="w-full bg-white px-3.5 py-2.5 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="stu-reg-name" className="block text-xs font-medium text-[#23181A]">
                      ชื่อ-นามสกุล (ไม่บังคับ กรอกเพิ่มทีหลังได้)
                    </label>
                    <input
                      id="stu-reg-name"
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="เช่น นางสาวกานดา ใจดี"
                      className="w-full rounded-xl border border-[#D8CBB8] bg-white px-3.5 py-2 text-sm text-[#23181A] focus:border-[#15803D] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="stu-reg-year-level" className="block text-xs font-medium text-[#23181A]">
                        ชั้นปีที่กำลังศึกษา
                      </label>
                      <select
                        id="stu-reg-year-level"
                        value={regYearLevel}
                        onChange={(e) => setRegYearLevel(e.target.value as YearLevel)}
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm text-[#23181A] focus:border-[#15803D] focus:outline-none"
                      >
                        {YEAR_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="stu-reg-academic-year" className="block text-xs font-medium text-[#23181A]">
                        ปีการศึกษา
                      </label>
                      <select
                        id="stu-reg-academic-year"
                        value={regAcademicYear}
                        onChange={(e) => setRegAcademicYear(e.target.value as AcademicYear)}
                        className="w-full rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm text-[#23181A] focus:border-[#15803D] focus:outline-none"
                      >
                        {ACADEMIC_YEARS.map((yr) => (
                          <option key={yr} value={yr}>
                            {yr}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0F5132] via-[#157347] to-[#198754] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {loading ? 'กำลังลงทะเบียนนักศึกษา...' : 'สมัครสมาชิกด้วยรหัสนักศึกษา'}
                    </span>
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setStudentMode('login');
                        setError(null);
                      }}
                      className="text-xs font-medium text-[#5A4B4E] hover:text-[#7A1629] hover:underline"
                    >
                      มีบัญชีแล้ว? กลับไปเข้าสู่ระบบ
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Role 2: Teacher */}
          {activeRole === 'teacher' && (
            <form onSubmit={handleTeacherSubmit} className="space-y-4">
              {teacherMode === 'register' && (
                <div className="space-y-1.5">
                  <label htmlFor="t-fullname" className="block text-xs sm:text-sm font-medium text-[#23181A]">
                    ชื่อ-นามสกุลอาจารย์
                  </label>
                  <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#15803D] focus-within:ring-2 focus-within:ring-[#15803D]/15">
                    <span className="flex w-11 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#15803D]">
                      <UserCheck className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <input
                      id="t-fullname"
                      type="text"
                      value={teacherFullName}
                      onChange={(e) => setTeacherFullName(e.target.value)}
                      placeholder="เช่น อ.ดร.สุภาพร วงศ์ล้านนา"
                      className="w-full bg-white px-3.5 py-2.5 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="t-user" className="block text-xs sm:text-sm font-medium text-[#23181A]">
                  ชื่อผู้ใช้งาน (Username)
                </label>
                <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#7A1629] focus-within:ring-2 focus-within:ring-[#7A1629]/15">
                  <span className="flex w-11 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#7A1629]">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <input
                    id="t-user"
                    type="text"
                    required
                    value={teacherUsername}
                    onChange={(e) => setTeacherUsername(e.target.value)}
                    placeholder="กรอกชื่อผู้ใช้งาน เช่น ajarn.somchai"
                    className="w-full bg-white px-3.5 py-2.5 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="t-pass" className="block text-xs sm:text-sm font-medium text-[#23181A]">
                  รหัสผ่าน (Password)
                </label>
                <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#7A1629] focus-within:ring-2 focus-within:ring-[#7A1629]/15">
                  <span className="flex w-11 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#7A1629]">
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <input
                    id="t-pass"
                    type={showTeacherPassword ? 'text' : 'password'}
                    required
                    value={teacherPassword}
                    onChange={(e) => setTeacherPassword(e.target.value)}
                    placeholder={
                      teacherMode === 'register'
                        ? 'อย่างน้อย 8 ตัวอักษร (ตัวอักษรและตัวเลข)'
                        : 'กรอกรหัสผ่าน'
                    }
                    className="w-full bg-white px-3.5 py-2.5 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTeacherPassword((v) => !v)}
                    aria-label={showTeacherPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    className="px-3 text-[#7A6B6E] hover:text-[#7A1629]"
                  >
                    {showTeacherPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {teacherMode === 'login' && renderVerificationChallenge()}

              <div className="space-y-2.5 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60 ${
                    teacherMode === 'register'
                      ? 'bg-gradient-to-r from-[#0F5132] via-[#157347] to-[#198754]'
                      : 'bg-gradient-to-r from-[#6B1022] via-[#7A1629] to-[#961F36]'
                  }`}
                >
                  {teacherMode === 'register' ? (
                    <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {loading
                      ? 'กำลังดำเนินการ...'
                      : teacherMode === 'register'
                        ? 'สมัครสมาชิกอาจารย์และเข้าสู่ระบบ'
                        : 'เข้าสู่ระบบ'}
                  </span>
                </button>

                {teacherMode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTeacherMode('register');
                      setError(null);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#16A34A] bg-white px-4 py-2.5 text-sm font-semibold text-[#15803D] hover:bg-[#ECFDF5] transition-all"
                  >
                    <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>สมัครสมาชิก (อาจารย์ประจำสาขา)</span>
                  </button>
                ) : (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setTeacherMode('login');
                        setError(null);
                        refreshCaptcha();
                      }}
                      className="text-xs font-medium text-[#5A4B4E] hover:text-[#7A1629] hover:underline"
                    >
                      มีบัญชีแล้ว? กลับไปเข้าสู่ระบบอาจารย์
                    </button>
                  </div>
                )}
              </div>
            </form>
          )}

          {/* Role 3: Admin */}
          {activeRole === 'admin' && (() => {
            const adminPwdCheck = evaluateAdminSetupPassword(adminPassword);
            const adminPwdMatched =
              Boolean(adminPassword) && adminConfirmPassword === adminPassword;
            return (
              <form onSubmit={handleAdminSubmit} className="space-y-3">
                {!adminInitialized && (
                  <>
                    <div className="rounded-xl border border-[#C6922C]/70 bg-[#FDF8EC] px-3.5 py-2.5 text-xs text-[#5C410A] space-y-1 leading-relaxed">
                      <p className="font-display font-bold text-[#7A1629]">
                        ตั้งค่าบัญชีผู้ดูแลระบบหลัก (เข้าใช้งานครั้งแรก)
                      </p>
                      <p>
                        ใช้สำหรับนำเข้ารายชื่อนักศึกษา จัดการบัญชีผู้ใช้ และอนุมัติทุน หลังสร้างสำเร็จระบบจะพาเข้าสู่หน้าจัดการทันที
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="adm-name" className="block text-xs font-medium text-[#23181A]">
                        ชื่อ-นามสกุลผู้ดูแลระบบ *
                      </label>
                      <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#C6922C] focus-within:ring-2 focus-within:ring-[#C6922C]/20">
                        <span className="flex w-10 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#A16B14]">
                          <UserCheck className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <input
                          id="adm-name"
                          type="text"
                          required
                          value={adminFullName}
                          onChange={(e) => setAdminFullName(e.target.value)}
                          placeholder="เช่น เจ้าหน้าที่งานทุนการศึกษา สาขาสังคมศึกษา"
                          className="w-full bg-white px-3 py-2 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <label htmlFor="adm-user" className="block text-xs font-medium text-[#23181A]">
                    ชื่อผู้ใช้ผู้ดูแลระบบ (Username) *
                  </label>
                  <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#7A1629] focus-within:ring-2 focus-within:ring-[#7A1629]/15">
                    <span className="flex w-10 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#7A1629]">
                      <User className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <input
                      id="adm-user"
                      type="text"
                      required
                      autoComplete="username"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder={!adminInitialized ? 'เช่น admin หรือ admin.social (ภาษาอังกฤษ)' : 'กรอกชื่อผู้ใช้งาน เช่น admin'}
                      className="w-full bg-white px-3 py-2 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="adm-pass" className="block text-xs font-medium text-[#23181A]">
                    รหัสผ่าน (Password) *
                  </label>
                  <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#7A1629] focus-within:ring-2 focus-within:ring-[#7A1629]/15">
                    <span className="flex w-10 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#7A1629]">
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <input
                      id="adm-pass"
                      type={showAdminPassword ? 'text' : 'password'}
                      required
                      autoComplete={!adminInitialized ? 'new-password' : 'current-password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder={
                        !adminInitialized
                          ? `อย่างน้อย ${MIN_ADMIN_PASSWORD_LENGTH} ตัวอักษร (ตัวอักษรและตัวเลข)`
                          : 'กรอกรหัสผ่านผู้ดูแลระบบ'
                      }
                      className="w-full bg-white px-3 py-2 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword((v) => !v)}
                      aria-label={showAdminPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      className="px-3 text-[#7A6B6E] hover:text-[#7A1629]"
                    >
                      {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {!adminInitialized && (
                  <>
                    <div className="space-y-1">
                      <label
                        htmlFor="adm-pass-confirm"
                        className="block text-xs font-medium text-[#23181A]"
                      >
                        ยืนยันรหัสผ่าน (Confirm Password) *
                      </label>
                      <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white overflow-hidden transition-all focus-within:border-[#7A1629] focus-within:ring-2 focus-within:ring-[#7A1629]/15">
                        <span className="flex w-10 shrink-0 items-center justify-center border-r border-[#E4D9C6] bg-[#FAF6EE] text-[#7A1629]">
                          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <input
                          id="adm-pass-confirm"
                          type={showAdminConfirmPassword ? 'text' : 'password'}
                          required
                          autoComplete="new-password"
                          value={adminConfirmPassword}
                          onChange={(e) => setAdminConfirmPassword(e.target.value)}
                          placeholder="กรอกรหัสผ่านผู้ดูแลระบบอีกครั้งให้ตรงกัน"
                          className="w-full bg-white px-3 py-2 text-sm text-[#23181A] placeholder:text-[#9A8B8E] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminConfirmPassword((v) => !v)}
                          aria-label={showAdminConfirmPassword ? 'ซ่อนยืนยันรหัสผ่าน' : 'แสดงยืนยันรหัสผ่าน'}
                          className="px-3 text-[#7A6B6E] hover:text-[#7A1629]"
                        >
                          {showAdminConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/80 px-3 py-2 text-[11px]">
                      <li className={adminPwdCheck.minLength ? 'text-[#15803D] font-medium' : 'text-[#66585B]'}>
                        {adminPwdCheck.minLength ? '✓' : '○'} ยาวอย่างน้อย {MIN_ADMIN_PASSWORD_LENGTH} ตัวอักษร
                      </li>
                      <li
                        className={
                          adminPwdCheck.hasLetter && adminPwdCheck.hasDigit
                            ? 'text-[#15803D] font-medium'
                            : 'text-[#66585B]'
                        }
                      >
                        {adminPwdCheck.hasLetter && adminPwdCheck.hasDigit ? '✓' : '○'} มีตัวอักษร (A-Z/a-z) และตัวเลข
                      </li>
                      <li className={`sm:col-span-2 ${adminPwdMatched ? 'text-[#15803D] font-medium' : 'text-[#66585B]'}`}>
                        {adminPwdMatched ? '✓' : '○'} ยืนยันรหัสผ่านตรงกัน
                      </li>
                    </ul>
                  </>
                )}

                {adminInitialized && renderVerificationChallenge()}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5B0F1D] via-[#7A1629] to-[#961F36] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {loading
                      ? 'กำลังดำเนินการ...'
                      : !adminInitialized
                        ? 'ลงทะเบียนผู้ดูแลระบบครั้งแรกและเปิดระบบ'
                        : 'เข้าสู่ระบบผู้ดูแลระบบ'}
                  </span>
                </button>
              </form>
            );
          })()}

          {showForgotHelp && activeRole !== 'student' && (
            <div className="rounded-xl border border-[#DFC9A1] bg-[#FDF8EC] px-4 py-3 text-xs text-[#5C410A] leading-relaxed">
              <p className="font-semibold text-[#7A1629]">คำแนะนำการเข้าสู่ระบบเจ้าหน้าที่:</p>
              <p className="mt-1">
                {activeRole === 'admin'
                  ? !adminInitialized
                    ? 'ระบบยังไม่เคยสร้างบัญชีผู้ดูแลระบบ ท่านสามารถกรอกข้อมูลด้านบนเพื่อสร้างบัญชีผู้ดูแลระบบคนแรกได้ทันที'
                    : 'หากผู้ดูแลระบบลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบอีกท่านในสาขาวิชาสังคมศึกษาเพื่อรีเซ็ตรหัสผ่านในเมนู "จัดการผู้ใช้งาน & รหัสผ่าน"'
                  : 'อาจารย์ประจำสาขาสามารถติดต่อผู้ดูแลระบบสาขาวิชาสังคมศึกษาเพื่อรีเซ็ตรหัสผ่านใหม่ได้ทันที'}
              </p>
            </div>
          )}
        </div>

        {/* Minimal Card Footer */}
        <div className="border-t border-[#EAE0CE] bg-[#FAF6EE] px-4 py-3">
          <div className="flex items-center justify-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                if (activeRole === 'student') {
                  setActiveRole('teacher');
                  setTeacherMode('login');
                } else {
                  setActiveRole('student');
                  setStudentMode('login');
                }
                setError(null);
                setShowForgotHelp(false);
                refreshCaptcha();
              }}
              className="inline-flex items-center gap-1 font-semibold text-[#7A1629] hover:underline"
            >
              <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{activeRole === 'student' ? 'สำหรับอาจารย์' : 'สำหรับนักศึกษา'}</span>
            </button>
            <span className="text-[#D4C6B0]" aria-hidden="true">
              |
            </span>
            <button
              type="button"
              onClick={() => setShowForgotHelp((v) => !v)}
              className="inline-flex items-center gap-1 font-medium text-[#66585B] hover:text-[#23181A] hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{activeRole === 'admin' && !adminInitialized ? 'วิธีตั้งค่าครั้งแรก?' : 'ลืมรหัสผ่าน?'}</span>
            </button>
          </div>
        </div>
      </section>

      <p className="mt-5 text-center text-xs text-[#66585B]">
        © 2569 งานทุนการศึกษา &amp; กยศ. สาขาวิชาสังคมศึกษา มหาวิทยาลัยราชภัฏเชียงใหม่
      </p>
    </main>
  );
}
