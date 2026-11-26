import { useEffect, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { api } from './services/api';
import type { StudentFullRecord, UserAccount, UserRole } from './types/scholarship';
import { TopBar } from './components/TopBar';
import { PublicHomePortal, PublicHomeTab } from './components/PublicHomePortal';
import { LoginPortal } from './components/LoginPortal';
import { StudentDashboard, StudentSectionKey } from './components/StudentDashboard';
import { StaffDashboard, StaffSectionKey } from './components/StaffDashboard';
import { ChangePasswordPanel } from './components/ChangePasswordPanel';

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [adminInitialized, setAdminInitialized] = useState(false);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [studentBundle, setStudentBundle] = useState<StudentFullRecord | null>(null);
  const [teacherNames, setTeacherNames] = useState<string[]>([]);
  const [studentSection, setStudentSection] = useState<StudentSectionKey>('home');
  const [staffSection, setStaffSection] = useState<StaffSectionKey>('home');
  const [authError, setAuthError] = useState<string | null>(null);
  const [initialPasswordBanner, setInitialPasswordBanner] = useState<string | null>(null);

  // Public landing/overview shell state when logged out
  const [guestView, setGuestView] = useState<'overview' | 'login'>('overview');
  const [publicHomeTab, setPublicHomeTab] = useState<PublicHomeTab>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loginInitialRole, setLoginInitialRole] = useState<UserRole>('student');
  const [loginInitialStudentMode, setLoginInitialStudentMode] = useState<
    'login' | 'register'
  >('login');

  const [bootError, setBootError] = useState<string | null>(null);

  const loadStudentData = async () => {
    const res = await api.getMyStudentBundle();
    setStudentBundle(res.bundle);
    setTeacherNames(res.teacherNames || []);
  };

  const bootstrapSession = async () => {
    setInitializing(true);
    setBootError(null);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [statusRes, meRes] = await Promise.all([api.getAuthStatus(), api.getMe()]);
        setAdminInitialized(statusRes.adminInitialized);
        if (meRes.user) {
          setUser(meRes.user);
          if (meRes.user.role === 'student' && !meRes.user.mustChangePassword) {
            await loadStudentData();
          }
        }
        setInitializing(false);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 400 : 900));
        }
      }
    }
    setBootError(
      (lastError as Error)?.message ||
        'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ชั่วคราว กรุณากดลองใหม่อีกครั้ง'
    );
    setInitializing(false);
  };

  useEffect(() => {
    void bootstrapSession();
  }, []);

  const handleAuthenticated = async (authedUser: UserAccount) => {
    setAuthError(null);
    setInitialPasswordBanner(null);
    setUser(authedUser);
    setStudentSection('home');
    setStaffSection('home');
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
    if (authedUser.role === 'student') {
      if (authedUser.mustChangePassword) {
        setStudentBundle(null);
        return;
      }
      try {
        await loadStudentData();
      } catch (err) {
        setAuthError((err as Error).message);
        setUser(null);
      }
    } else {
      setStudentBundle(null);
      setTeacherNames([]);
    }
  };

  const handleForcedPasswordChanged = async (updatedUser: UserAccount, message: string) => {
    setUser(updatedUser);
    setInitialPasswordBanner(message);
    setStudentSection('home');
    try {
      await loadStudentData();
    } catch (err) {
      setAuthError((err as Error).message);
    }
  };

  const refreshAuthStatus = () => {
    api
      .getAuthStatus()
      .then((res) => setAdminInitialized(res.adminInitialized))
      .catch(() => {});
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setStudentBundle(null);
    setTeacherNames([]);
    setStudentSection('home');
    setStaffSection('home');
    setGuestView('overview');
    setPublicHomeTab('overview');
    refreshAuthStatus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleDeleteOwnAccount = async () => {
    await api.deleteMyAccount();
    setUser(null);
    setStudentBundle(null);
    setTeacherNames([]);
    setStudentSection('home');
    setStaffSection('home');
    setGuestView('overview');
    setPublicHomeTab('overview');
    refreshAuthStatus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleGoHome = () => {
    setStudentSection('home');
    setStaffSection('home');
    if (!user) {
      setGuestView('overview');
      setPublicHomeTab('overview');
    }
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateAuth = (
    role: UserRole,
    studentMode: 'login' | 'register' = 'login'
  ) => {
    setLoginInitialRole(role);
    setLoginInitialStudentMode(studentMode);
    setGuestView('login');
    refreshAuthStatus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const viewTransitionKey = initializing
    ? 'loading'
    : !user
      ? `guest-${guestView}`
      : user.role === 'student'
        ? user.mustChangePassword
          ? 'student-force-password'
          : 'student-portal'
        : 'staff-portal';

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#FAF6EE] text-[#23181A]">
        <motion.div
          key={viewTransitionKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          {initializing ? (
            <div className="mx-auto max-w-[1200px] px-6 py-28 text-center space-y-3">
              <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#C6922C] border-t-[#7A1629] animate-spin" />
              <p className="text-sm text-[#66585B]">กำลังโหลดระบบ EDU SOCIAL CARE CMRU...</p>
            </div>
          ) : bootError ? (
            <div className="mx-auto max-w-[640px] px-6 py-24 text-center space-y-4">
              <div className="rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-6 space-y-3">
                <p className="font-display text-base font-bold text-[#92400E]">
                  การเชื่อมต่อเซิร์ฟเวอร์สะดุดชั่วคราว
                </p>
                <p className="text-xs text-[#78350F]">{bootError}</p>
                <button
                  type="button"
                  onClick={() => void bootstrapSession()}
                  className="inline-flex items-center justify-center rounded-xl bg-[#7A1629] px-5 py-2 text-xs font-semibold text-white hover:bg-[#5E1020] transition-colors"
                >
                  เชื่อมต่อใหม่
                </button>
              </div>
            </div>
          ) : !user ? (
            guestView === 'overview' ? (
              <PublicHomePortal
                activeTab={publicHomeTab}
                onSelectTab={setPublicHomeTab}
                mobileMenuOpen={mobileSidebarOpen}
                onSetMobileMenuOpen={setMobileSidebarOpen}
                adminInitialized={adminInitialized}
                onNavigateAuth={handleNavigateAuth}
              />
            ) : (
              <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#FAF6EE] via-[#FAF6EE] to-[#F4ECDD]">
                <TopBar
                  user={null}
                  guestView="login"
                  activeNavKey="home"
                  navItems={[]}
                  onSelectNav={() => {}}
                  onGoHome={handleGoHome}
                  onLogout={handleLogout}
                  onOpenAuth={() => handleNavigateAuth('student', 'login')}
                />
                {authError && (
                  <div role="alert" className="mx-auto mt-6 w-full max-w-[1360px] px-6">
                    <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
                      {authError}
                    </div>
                  </div>
                )}
                <div className="flex-1">
                  <LoginPortal
                    adminInitialized={adminInitialized}
                    initialRole={loginInitialRole}
                    initialStudentMode={loginInitialStudentMode}
                    onBackToOverview={handleGoHome}
                    onAuthenticated={handleAuthenticated}
                    onAdminInitialized={() => setAdminInitialized(true)}
                  />
                </div>
              </div>
            )
          ) : user.role === 'student' ? (
            user.mustChangePassword ? (
              <ChangePasswordPanel
                mode="forced"
                user={user}
                onPasswordChanged={handleForcedPasswordChanged}
                onLogout={handleLogout}
              />
            ) : studentBundle ? (
              <StudentDashboard
                bundle={studentBundle}
                teacherNames={teacherNames}
                activeSection={studentSection}
                onSelectSection={(sec) => {
                  setStudentSection(sec);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onUpdateBundle={(next) => {
                  setStudentBundle(next);
                  setUser(next.user);
                }}
                onLogout={handleLogout}
                onDeleteAccount={handleDeleteOwnAccount}
                statusBanner={initialPasswordBanner}
                onDismissStatusBanner={() => setInitialPasswordBanner(null)}
              />
            ) : (
              <div className="mx-auto max-w-[1200px] px-6 py-28 text-center space-y-3">
                <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#C6922C] border-t-[#7A1629] animate-spin" />
                <p className="text-sm text-[#66585B]">กำลังโหลดข้อมูลนักศึกษา...</p>
              </div>
            )
          ) : (
            <StaffDashboard
              currentUser={user}
              activeSection={staffSection}
              onSelectSection={setStaffSection}
              onLogout={handleLogout}
            />
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
}
