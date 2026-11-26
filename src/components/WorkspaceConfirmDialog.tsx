import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

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
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!request || busy) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, busy, onCancel]);

  const isDanger = request?.tone === 'danger';
  const confirmBg = isDanger
    ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
    : 'bg-[#7A1629] hover:bg-[#5E1020] text-white';

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={request.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.15, ease: 'easeOut' }}
          style={{ willChange: 'opacity' }}
          onClick={(e) => {
            if (!busy && e.target === e.currentTarget) onCancel();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4 }}
            transition={{
              duration: prefersReducedMotion ? 0.01 : 0.17,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ willChange: 'transform, opacity' }}
            className="w-full max-w-md rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    isDanger
                      ? 'bg-[#FEE2E2] dark:bg-red-950/60 text-[#B91C1C] dark:text-red-300'
                      : 'bg-[#FEF3C7] dark:bg-amber-950/60 text-[#B45309] dark:text-amber-300'
                  }`}
                >
                  {isDanger ? (
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-[#23181A] dark:text-[#F2EFEA]">
                    {request.title}
                  </h3>
                  <p className="mt-1 text-sm text-[#5A4B4E] dark:text-[#A19B91] leading-relaxed">
                    {request.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                aria-label="ปิดหน้าต่างยืนยัน"
                className="rounded-lg p-1 text-[#66585B] dark:text-[#A19B91] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A] hover:text-[#23181A] dark:hover:text-[#F2EFEA]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {request.details && request.details.length > 0 && (
              <ul className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1B1D23] px-4 py-3 space-y-1.5 text-xs text-[#4A3B3E] dark:text-[#D1CBC2]">
                {request.details.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[#7A1629] dark:text-[#E8C97A] font-bold">•</span>
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
                className="rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1B1D23] px-4 py-2 text-xs font-semibold text-[#5A4B4E] dark:text-[#D1CBC2] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A] transition-colors disabled:opacity-60"
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
