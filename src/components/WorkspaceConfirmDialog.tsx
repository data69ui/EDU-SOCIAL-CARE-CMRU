import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { motion } from 'motion/react';

export interface WorkspaceConfirmRequest {
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'warning' | 'danger' | 'primary';
}

interface WorkspaceConfirmDialogProps {
  request: WorkspaceConfirmRequest | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WorkspaceConfirmDialog({
  request,
  busy = false,
  onConfirm,
  onCancel,
}: WorkspaceConfirmDialogProps) {
  if (!request) return null;

  const isDanger = request.tone === 'danger';
  const confirmBg = isDanger
    ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
    : 'bg-[#7A1629] hover:bg-[#5E1020] text-white';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isDanger
                  ? 'bg-[#FEE2E2] text-[#B91C1C]'
                  : 'bg-[#FEF3C7] text-[#B45309]'
              }`}
            >
              {isDanger ? (
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-[#23181A]">
                {request.title}
              </h3>
              <p className="mt-1 text-sm text-[#5A4B4E] leading-relaxed">
                {request.description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="ปิดหน้าต่างยืนยัน"
            className="rounded-lg p-1 text-[#66585B] hover:bg-[#FAF6EE] hover:text-[#23181A]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {request.details && request.details.length > 0 && (
          <ul className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] px-4 py-3 space-y-1.5 text-xs text-[#4A3B3E]">
            {request.details.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-[#7A1629] font-bold">•</span>
                <span className="break-all">{item}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-[#D8CBB8] bg-white px-4 py-2 text-xs font-semibold text-[#5A4B4E] hover:bg-[#FAF6EE] transition-colors disabled:opacity-60"
          >
            {request.cancelLabel || 'ยกเลิก'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${confirmBg}`}
          >
            {busy ? 'กำลังดำเนินการ...' : request.confirmLabel || 'ยืนยันดำเนินการ'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
