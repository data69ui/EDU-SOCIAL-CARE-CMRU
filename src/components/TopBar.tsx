import { LogOut, Home, Menu, LayoutDashboard, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import type { UserAccount } from '../types/scholarship';
import { ThemeToggleButton } from '../contexts/ThemeContext';

interface TopBarProps {
  user: UserAccount | null;
  guestView?: 'overview' | 'login';
  activeNavKey: string;
  navItems: { key: string; label: string }[];
  onSelectNav: (key: string) => void;
  onGoHome: () => void;
  onLogout: () => void;
  onOpenAuth?: () => void;
  onToggleMobileMenu?: () => void;
}

export function TopBar({
  user,
  guestView = 'overview',
  activeNavKey,
  navItems,
  onSelectNav,
  onGoHome,
  onLogout,
  onOpenAuth,
  onToggleMobileMenu,
}: TopBarProps) {
  const isGuestShell = !user;

  if (isGuestShell) {
    return (
      <header className="no-print sticky top-0 z-40 border-b border-[#530A18] bg-[#6B1022] dark:border-[#4A101C] dark:bg-[#2E060E] text-white shadow-sm">
        <div className="h-[2px] w-full bg-gradient-to-r from-[#C6922C] via-[#F2D388] to-[#C6922C]" />
        <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 sm:px-6 py-2.5 sm:py-3">
          {/* Zone 1: Mobile Menu Trigger + Brand Lockup */}
          <div className="flex min-w-0 items-center gap-3">
            {guestView === 'overview' && onToggleMobileMenu && (
              <button
                type="button"
                onClick={onToggleMobileMenu}
                aria-label="เปิดเมนูหลัก"
                className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 transition-colors shrink-0"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={guestView === 'login' ? onOpenAuth : onGoHome}
              className="group flex min-w-0 items-center gap-3 text-left whitespace-nowrap shrink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C97A] rounded-xl"
              title={guestView === 'login' ? 'หน้าเข้าสู่ระบบ' : 'กลับสู่หน้าภาพรวมข้อมูลทุน'}
            >
              <span className="inline-flex items-center rounded-xl bg-white px-2.5 py-1 shadow-xs transition-transform duration-200 group-hover:scale-[1.03] shrink-0">
                <img
                  src="/assets/aistudio/image_7437b452.png"
                  alt="EDU SOCIAL CARE CMRU"
                  referrerPolicy="no-referrer"
                  className="h-8 sm:h-9 w-auto object-contain"
                />
              </span>
              <span className="hidden sm:block font-display text-sm sm:text-base font-bold tracking-tight text-white truncate">
                EDU SOCIAL CARE CMRU
              </span>
            </button>
          </div>

          {/* Zone 2: Theme Toggle + Primary Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggleButton variant="icon" />
            {guestView === 'login' ? (
              <button
                type="button"
                onClick={onGoHome}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8C97A]/60 bg-white/10 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-white/20 transition-colors whitespace-nowrap shrink-0"
              >
                <LayoutDashboard className="h-4 w-4 shrink-0 text-[#E8C97A]" aria-hidden="true" />
                <span>ดูภาพรวมข้อมูลทุน</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C6922C] px-4 py-2 text-xs sm:text-sm font-semibold text-[#23181A] shadow-xs hover:bg-[#DFAB43] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
              >
                <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>เข้าสู่ระบบ</span>
              </button>
            )}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b border-[#E2D4BC] bg-[#FAF6EE]/90 dark:border-[#323640] dark:bg-[#1E2027]/90 backdrop-blur-md">
      <div className="h-[2px] w-full bg-gradient-to-r from-[#7A1629] via-[#C6922C] to-[#7A1629]" />
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-3 sm:gap-8 px-4 sm:px-6 py-3 sm:py-3.5">
        {/* Zone 1: Single-line clickable brand wordmark -> Always returns to Home */}
        <button
          type="button"
          onClick={onGoHome}
          className="group flex min-w-0 items-center gap-2.5 sm:gap-3 text-left whitespace-nowrap shrink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7A1629] rounded-xl"
          title="กลับสู่หน้าหลัก"
        >
          <span className="inline-flex items-center rounded-xl border border-[#E5DAC6] bg-white px-2.5 py-1 shadow-2xs transition-transform duration-200 group-hover:scale-[1.03]">
            <img
              src="/assets/aistudio/image_7437b452.png"
              alt="EDU SOCIAL CARE CMRU"
              referrerPolicy="no-referrer"
              className="h-8 sm:h-10 w-auto object-contain shrink-0"
            />
          </span>
          <span className="hidden sm:inline font-display text-sm lg:text-base font-bold tracking-tight text-[#7A1629] dark:text-[#E8C97A] truncate transition-colors group-hover:text-[#5B0F1D] dark:group-hover:text-[#F5D98E]">
            งานทุนการศึกษา &amp; กยศ.
          </span>
        </button>

        {/* Zone 2: Concise single-line text navigation links with animated underline */}
        <nav
          aria-label="เมนูหลัก"
          className="hidden md:flex items-center gap-6 overflow-x-auto"
        >
          <button
            type="button"
            onClick={onGoHome}
            className={`relative inline-flex items-center gap-1.5 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#7A1629] ${
              activeNavKey === 'home'
                ? 'text-[#7A1629] dark:text-[#E8C97A]'
                : 'text-[#5A4B4E] hover:text-[#7A1629] dark:text-[#A19B91] dark:hover:text-[#F2EFEA]'
            }`}
          >
            <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>หน้าหลัก</span>
            {activeNavKey === 'home' && (
              <motion.span
                layoutId="topbar-active-line"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#C6922C]"
              />
            )}
          </button>

          {navItems.map((item) => {
            const isActive = activeNavKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectNav(item.key)}
                className={`relative py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#7A1629] ${
                  isActive
                    ? 'text-[#7A1629] dark:text-[#E8C97A]'
                    : 'text-[#5A4B4E] hover:text-[#7A1629] dark:text-[#A19B91] dark:hover:text-[#F2EFEA]'
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="topbar-active-line"
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#C6922C]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme Toggle + Logout */}
        <div className="flex items-center gap-2.5 shrink-0">
          <ThemeToggleButton variant="icon" />
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-[#7A1629] px-3 sm:px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-[#5B0F1D] dark:bg-[#8A182E] dark:hover:bg-[#A01E37] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C6922C]"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Mobile compact secondary strip */}
      {navItems.length > 0 && (
        <div className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-[#EAE0CE] bg-[#F6EFE2] dark:border-[#323640] dark:bg-[#191B21] px-4 py-2">
          <button
            type="button"
            onClick={onGoHome}
            className={`text-xs font-medium whitespace-nowrap shrink-0 ${
              activeNavKey === 'home'
                ? 'text-[#7A1629] dark:text-[#E8C97A] underline underline-offset-4'
                : 'text-[#5A4B4E] dark:text-[#A19B91]'
            }`}
          >
            หน้าหลัก
          </button>
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectNav(item.key)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                activeNavKey === item.key
                  ? 'text-[#7A1629] dark:text-[#E8C97A] underline underline-offset-4'
                  : 'text-[#5A4B4E] dark:text-[#A19B91]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
