import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import type { UserAccount } from '../types/scholarship';
import { useSaveSuccess } from '../contexts/SaveSuccessContext';
import {
  evaluatePasswordStrength,
  MIN_STRONG_PASSWORD_LENGTH,
  validatePasswordChangePayload,
} from '../utils/scholarshipLogic';

interface ChangePasswordPanelProps {
  mode: 'forced' | 'self';
  user: UserAccount;
  onPasswordChanged: (updatedUser: UserAccount, message: string) => void;
  onLogout?: () => void;
}

export function ChangePasswordPanel({
  mode,
  user,
  onPasswordChanged,
  onLogout,
}: ChangePasswordPanelProps) {
  const { showSaveSuccess } = useSaveSuccess();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const strength = evaluatePasswordStrength(newPassword);
  const notSameAsCurrent = Boolean(newPassword) && newPassword !== currentPassword;
  const confirmMatches = Boolean(newPassword) && confirmPassword === newPassword;

  const requirements = [
    {
      label: `ความยาวอย่างน้อย ${MIN_STRONG_PASSWORD_LENGTH} ตัวอักษร`,
      met: strength.minLength,
    },
    {
      label: 'ตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ (A-Z)',
      met: strength.hasUpper,
    },
    {
      label: 'ตัวอักษรภาษาอังกฤษพิมพ์เล็ก (a-z)',
      met: strength.hasLower,
    },
    {
      label: 'ตัวเลข (0-9)',
      met: strength.hasDigit,
    },
    {
      label: 'ไม่ตรงกับรหัสผ่านเดิม',
      met: notSameAsCurrent,
    },
    {
      label: 'ยืนยันรหัสผ่านใหม่ตรงกัน',
      met: confirmMatches,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const check = validatePasswordChangePayload({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!check.valid) {
      setError(check.error || 'กรุณาตรวจสอบข้อมูลรหัสผ่านให้ครบถ้วน');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      const msg = res.message || 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว';
      setSuccessMessage(msg);
      showSaveSuccess(msg, 'บันทึกรหัสผ่านเสร็จสิ้นแล้ว');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onPasswordChanged(res.user, msg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const formCard = (
    <section
      aria-label={mode === 'forced' ? 'บังคับเปลี่ยนรหัสผ่านครั้งแรก' : 'เปลี่ยนรหัสผ่าน'}
      className={`w-full rounded-2xl border bg-white dark:bg-[#22242B] overflow-hidden ${
        mode === 'forced'
          ? 'max-w-lg border-[#D8C6A6] dark:border-[#343842] shadow-2xl'
          : 'max-w-2xl border-[#DFD1BA] dark:border-[#343842] surface-card'
      }`}
    >
      <div
        className={`px-6 py-4 border-b-2 border-[#C6922C] text-white ${
          mode === 'forced'
            ? 'bg-gradient-to-r from-[#5B0F1D] via-[#7A1629] to-[#961F36]'
            : 'bg-gradient-to-r from-[#6B1022] via-[#7A1629] to-[#961F36]'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <KeyRound className="h-5 w-5 shrink-0 text-[#F5D98E]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold">
              {mode === 'forced' ? 'ตั้งรหัสผ่านใหม่ก่อนเข้าใช้งานระบบ' : 'เปลี่ยนรหัสผ่าน'}
            </h2>
            <p className="text-xs text-[#F5E7CC] tabular-nums">
              บัญชีนักศึกษา: {user.studentId || user.username} · {user.fullName}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {mode === 'forced' && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-[#F59E0B]/60 bg-[#FFFBEB] dark:border-[#92400E] dark:bg-[#2A2212] p-4 text-sm text-[#78350F] dark:text-[#FDE68A]"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-[#B45309] dark:text-[#FBBF24] mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-display font-bold text-[#7A1629] dark:text-[#FCD34D]">
                เพื่อความปลอดภัยของบัญชีผู้ใช้งาน กรุณาเปลี่ยนรหัสผ่านก่อนเข้าใช้งานระบบ
              </p>
              <p className="text-xs text-[#66585B] dark:text-[#E5D3A6] leading-relaxed">
                ไม่สามารถข้ามขั้นตอนนี้ได้ กรุณากรอกรหัสผ่านปัจจุบัน (รหัสผ่านเริ่มต้นคือรหัสนักศึกษา 8 หลักของคุณ)
                และกำหนดรหัสผ่านใหม่ที่ปลอดภัย
              </p>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] dark:border-[#7F1D1D] dark:bg-[#3A1519] px-4 py-3 text-xs sm:text-sm text-[#991B1B] dark:text-[#FCA5A5]"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-[#86EFAC] bg-[#F0FDF4] dark:border-[#166534] dark:bg-[#143322] px-4 py-3 text-xs sm:text-sm font-medium text-[#166534] dark:text-[#4ADE80]"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Field 1: Current Password */}
          <div className="space-y-1.5">
            <label htmlFor="pw-current" className="block text-xs sm:text-sm font-medium text-[#23181A] dark:text-[#F2EFEA]">
              รหัสผ่านปัจจุบัน *
            </label>
            <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white dark:border-[#434856] dark:bg-[#1A1C21] overflow-hidden focus-within:border-[#7A1629] dark:focus-within:border-[#E8C97A] focus-within:ring-2 focus-within:ring-[#7A1629]/15 dark:focus-within:ring-[#E8C97A]/20">
              <input
                id="pw-current"
                type={showCurrent ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={
                  mode === 'forced'
                    ? 'กรอกรหัสผ่านเริ่มต้น (รหัสนักศึกษา 8 หลักของคุณ)'
                    : 'กรอกรหัสผ่านปัจจุบันของคุณ'
                }
                className="w-full bg-white dark:bg-[#1A1C21] px-3.5 py-2.5 text-sm text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? 'ซ่อนรหัสผ่านปัจจุบัน' : 'แสดงรหัสผ่านปัจจุบัน'}
                className="px-3 text-[#7A6B6E] hover:text-[#7A1629] dark:text-[#A19B91] dark:hover:text-[#E8C97A]"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Field 2: New Password */}
          <div className="space-y-1.5">
            <label htmlFor="pw-new" className="block text-xs sm:text-sm font-medium text-[#23181A] dark:text-[#F2EFEA]">
              รหัสผ่านใหม่ *
            </label>
            <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white dark:border-[#434856] dark:bg-[#1A1C21] overflow-hidden focus-within:border-[#7A1629] dark:focus-within:border-[#E8C97A] focus-within:ring-2 focus-within:ring-[#7A1629]/15 dark:focus-within:ring-[#E8C97A]/20">
              <input
                id="pw-new"
                type={showNew ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="อย่างน้อย 10 ตัวอักษร (A-Z, a-z, 0-9)"
                className="w-full bg-white dark:bg-[#1A1C21] px-3.5 py-2.5 text-sm text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? 'ซ่อนรหัสผ่านใหม่' : 'แสดงรหัสผ่านใหม่'}
                className="px-3 text-[#7A6B6E] hover:text-[#7A1629] dark:text-[#A19B91] dark:hover:text-[#E8C97A]"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Field 3: Confirm New Password */}
          <div className="space-y-1.5">
            <label htmlFor="pw-confirm" className="block text-xs sm:text-sm font-medium text-[#23181A] dark:text-[#F2EFEA]">
              ยืนยันรหัสผ่านใหม่ *
            </label>
            <div className="flex items-stretch rounded-xl border border-[#D8CBB8] bg-white dark:border-[#434856] dark:bg-[#1A1C21] overflow-hidden focus-within:border-[#7A1629] dark:focus-within:border-[#E8C97A] focus-within:ring-2 focus-within:ring-[#7A1629]/15 dark:focus-within:ring-[#E8C97A]/20">
              <input
                id="pw-confirm"
                type={showConfirm ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านใหม่อีกครั้งให้ตรงกัน"
                className="w-full bg-white dark:bg-[#1A1C21] px-3.5 py-2.5 text-sm text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'ซ่อนยืนยันรหัสผ่านใหม่' : 'แสดงยืนยันรหัสผ่านใหม่'}
                className="px-3 text-[#7A6B6E] hover:text-[#7A1629] dark:text-[#A19B91] dark:hover:text-[#E8C97A]"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Password Security Checklist */}
        <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/80 dark:border-[#343842] dark:bg-[#181A20] p-4 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#7A1629] dark:text-[#E8C97A]">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>เงื่อนไขความปลอดภัยของรหัสผ่านใหม่</span>
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
            {requirements.map((req) => (
              <li
                key={req.label}
                className={`flex items-center gap-1.5 ${
                  req.met
                    ? 'text-[#15803D] dark:text-[#4ADE80] font-medium'
                    : 'text-[#66585B] dark:text-[#A19B91]'
                }`}
              >
                <CheckCircle2
                  className={`h-3.5 w-3.5 shrink-0 ${
                    req.met ? 'text-[#16A34A] dark:text-[#4ADE80]' : 'text-[#C4B7A3] dark:text-[#555B6A]'
                  }`}
                  aria-hidden="true"
                />
                <span>{req.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {mode === 'forced' && onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CBB8] bg-white px-4 py-2.5 text-xs sm:text-sm font-medium text-[#5A4B4E] hover:bg-[#FAF6EE] dark:border-[#3A3E4A] dark:bg-[#282B33] dark:text-[#CEC8BE] dark:hover:bg-[#323640] transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>ออกจากระบบ</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6B1022] via-[#7A1629] to-[#961F36] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:brightness-110 transition-all disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {submitting
                ? 'กำลังบันทึกรหัสผ่าน...'
                : mode === 'forced'
                  ? 'บันทึกรหัสผ่านใหม่และเข้าใช้งานระบบ'
                  : 'บันทึกรหัสผ่านใหม่'}
            </span>
          </button>
        </div>
      </form>
    </section>
  );

  if (mode === 'forced') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="บังคับเปลี่ยนรหัสผ่านครั้งแรก"
        className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_15%_12%,rgba(122,22,41,0.12),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(198,146,44,0.16),transparent_44%)] bg-[#FAF6EE] dark:bg-[#16171B] p-4 sm:p-6"
      >
        {formCard}
      </div>
    );
  }

  return formCard;
}
