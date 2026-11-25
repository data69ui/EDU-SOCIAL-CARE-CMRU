import type { ReactNode } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { UserAccount } from '../types/scholarship';

export interface SidebarNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  disabled?: boolean;
}

export interface SidebarNavGroup {
  title?: string;
  items: SidebarNavItem[];
}

interface DashboardShellProps {
  user: UserAccount | null;
  profilePhotoUrl?: string | null;
  pageTitle: string;
  pageSubtitle?: string;
  breadcrumb?: string;
  activeNavKey: string;
  navGroups: SidebarNavGroup[];
  onSelectNav: (key: string) => void;
  onGoHome: () => void;
  onLogout?: () => void;
  topRightSlot?: ReactNode;
  sidebarExtraSlot?: ReactNode;
  mobileMenuOpen: boolean;
  onSetMobileMenuOpen: (open: boolean) => void;
  children: ReactNode;
}

function getRoleLabel(role: UserAccount['role']) {
  if (role === 'admin') return 'ผู้ดูแลระบบ';
  if (role === 'teacher') return 'อาจารย์ประจำสาขา';
  return 'นักศึกษา';
}

function getInitials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return 'CM';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function DashboardShell({
  user,
  profilePhotoUrl,
  pageTitle,
  pageSubtitle,
  breadcrumb,
  activeNavKey,
  navGroups,
  onSelectNav,
  onGoHome,
  onLogout,
  topRightSlot,
  sidebarExtraSlot,
  mobileMenuOpen,
  onSetMobileMenuOpen,
  children,
}: DashboardShellProps) {
  const handleSelectItem = (key: string) => {
    onSelectNav(key);
    onSetMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderSidebarBody = () => (
    <div className="flex h-full flex-col justify-between bg-gradient-to-b from-[#6B1022] via-[#5B0F1D] to-[#430A14] text-white">
      <div className="flex flex-col min-h-0 flex-1">
        {/* Top Brand Lockup -> Clickable to return Home */}
        <div className="border-b border-white/10 px-4 py-4">
          <button
            type="button"
            onClick={() => {
              onGoHome();
              onSetMobileMenuOpen(false);
            }}
            className="group flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-[#E8C97A]"
            title="กลับสู่หน้าหลัก (Dashboard)"
          >
            <span className="inline-flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-xs transition-transform duration-200 group-hover:scale-[1.03]">
              <img
                src="/assets/aistudio/image_7437b452.png"
                alt="EDU SOCIAL CARE CMRU"
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold tracking-tight text-white truncate">
                EDU SOCIAL CARE
              </span>
              <span className="block text-[11px] text-[#E8C97A] truncate">
                งานทุนการศึกษา &amp; กยศ. มร.ชม.
              </span>
            </span>
          </button>
        </div>

        {/* User Profile Summary Card when logged in */}
        {user && (
          <div className="mx-3 mt-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-xs">
            <div className="flex items-center gap-3">
              {profilePhotoUrl ? (
                <img
                  src={profilePhotoUrl}
                  alt={user.fullName}
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 shrink-0 rounded-full border-2 border-[#E8C97A]/80 object-cover bg-white"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#E8C97A]/70 bg-[#C6922C] font-display text-sm font-bold text-[#23181A]">
                  {getInitials(user.fullName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-white">
                  {user.fullName}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-[#E8C97A]/20 px-2 py-0.5 text-[11px] font-medium text-[#F5D98E]">
                    {getRoleLabel(user.role)}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-white/70 tabular-nums">
                  {user.studentId ? `รหัส ${user.studentId}` : user.username}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Groups */}
        <nav aria-label="เมนูหลักระบบ" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group, idx) => (
            <div key={group.title || `group-${idx}`} className="space-y-1">
              {group.title && (
                <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-[#E8C97A]/80 uppercase">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeNavKey === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => handleSelectItem(item.key)}
                    className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium whitespace-nowrap transition-all ${
                      active
                        ? 'bg-white/15 text-white border border-[#E8C97A]/45 shadow-xs'
                        : 'text-white/85 border border-transparent hover:bg-white/10 hover:text-white'
                    } disabled:opacity-45 disabled:cursor-not-allowed`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active ? 'text-[#E8C97A]' : 'text-white/75'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge !== '' && (
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                          active
                            ? 'bg-[#C6922C] text-[#23181A]'
                            : 'bg-white/15 text-white/90'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {sidebarExtraSlot && (
            <div className="border-t border-white/10 pt-3">{sidebarExtraSlot}</div>
          )}

          {user && onLogout && (
            <div className="border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => {
                  onSetMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-[#FECACA] hover:bg-white/10 hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          )}
        </nav>
      </div>

      {/* Institutional Motto Footer */}
      <div className="border-t border-white/10 p-3.5">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1">
          <p className="font-display text-xs font-semibold text-[#E8C97A]">
            Your Education, Our Care.
          </p>
          <p className="text-[11px] leading-relaxed text-white/75">
            สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#FAF6EE] text-[#23181A] print:bg-white">
      {/* Fixed Desktop Sidebar */}
      <aside className="no-print hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen border-r border-[#430A14]">
        {renderSidebarBody()}
      </aside>

      {/* Mobile Drawer Sidebar */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="no-print fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onSetMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/45 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: -270 }}
              animate={{ x: 0 }}
              exit={{ x: -270 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 flex w-[264px] max-w-[85vw] flex-col shadow-2xl"
            >
              <button
                type="button"
                onClick={() => onSetMobileMenuOpen(false)}
                aria-label="ปิดเมนู"
                className="absolute right-3 top-3.5 z-20 rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
              {renderSidebarBody()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Single Unified Top Utility Header */}
        <header className="no-print sticky top-0 z-30 border-b border-[#E5DAC7] bg-white/95 backdrop-blur-md">
          <div className="h-[2px] w-full bg-gradient-to-r from-[#7A1629] via-[#C6922C] to-[#7A1629]" />
          <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => onSetMobileMenuOpen(true)}
                aria-label="เปิดเมนูหลัก"
                className="lg:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#DFD1BA] bg-[#FAF6EE] text-[#7A1629] hover:bg-[#F3ECDF] transition-colors"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h1 className="font-display text-base sm:text-lg font-bold tracking-tight text-[#23181A] truncate">
                    {pageTitle}
                  </h1>
                  {breadcrumb && (
                    <span className="hidden sm:inline text-xs text-[#66585B] truncate">
                      · {breadcrumb}
                    </span>
                  )}
                </div>
                {pageSubtitle && (
                  <p className="hidden sm:block text-xs text-[#66585B] truncate">
                    {pageSubtitle}
                  </p>
                )}
              </div>
            </div>

            {topRightSlot && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">{topRightSlot}</div>
            )}
          </div>
        </header>

        {/* Workspace Canvas */}
        <main className="dashboard-main-content flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        {/* Minimal Footer */}
        <footer className="no-print border-t border-[#E5DAC7] bg-[#F4EDE0]/70 px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#66585B]">
            <span>
              EDU SOCIAL CARE CMRU · งานทุนการศึกษา &amp; กยศ. สาขาวิชาสังคมศึกษา มหาวิทยาลัยราชภัฏเชียงใหม่
            </span>
            <span className="font-display font-medium text-[#7A1629]">
              Your Education, Our Care.
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
