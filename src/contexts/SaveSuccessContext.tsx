import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const AUTO_CLOSE_MS = 3000;

interface SaveSuccessPayload {
  id: number;
  title: string;
  message: string;
}

interface SaveSuccessContextValue {
  showSaveSuccess: (message?: string, title?: string) => void;
}

const SaveSuccessContext = createContext<SaveSuccessContextValue | null>(null);

export function SaveSuccessProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<SaveSuccessPayload | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [remainingMs, setRemainingMs] = useState(AUTO_CLOSE_MS);
  const idCounterRef = useRef(0);
  const timerStartRef = useRef<number>(0);
  const remainingRef = useRef<number>(AUTO_CLOSE_MS);
  const prefersReducedMotion = useReducedMotion();

  const showSaveSuccess = useCallback(
    (
      message = 'ข้อมูลถูกบันทึกลงในระบบเรียบร้อยแล้ว',
      title = 'บันทึกข้อมูลเสร็จสิ้นแล้ว'
    ) => {
      idCounterRef.current += 1;
      remainingRef.current = AUTO_CLOSE_MS;
      setRemainingMs(AUTO_CLOSE_MS);
      setIsPaused(false);
      setPopup({
        id: idCounterRef.current,
        title,
        message,
      });
    },
    []
  );

  const closePopup = useCallback(() => {
    setPopup(null);
    setIsPaused(false);
    remainingRef.current = AUTO_CLOSE_MS;
    setRemainingMs(AUTO_CLOSE_MS);
  }, []);

  useEffect(() => {
    if (!popup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopup();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [popup, closePopup]);

  useEffect(() => {
    if (!popup) return;
    if (isPaused) return;

    timerStartRef.current = performance.now();
    const timeoutId = window.setTimeout(() => {
      closePopup();
    }, remainingRef.current);

    return () => {
      window.clearTimeout(timeoutId);
      const elapsed = performance.now() - timerStartRef.current;
      const nextRemaining = Math.max(0, remainingRef.current - elapsed);
      remainingRef.current = nextRemaining;
      setRemainingMs(nextRemaining);
    };
  }, [popup, isPaused, closePopup]);

  const modalNode = (
    <AnimatePresence>
      {popup && (
        <motion.div
          key="save-success-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-success-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.16, ease: 'easeOut' }}
          style={{ willChange: 'opacity' }}
          className="no-print fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePopup();
          }}
        >
          <motion.div
            key={popup.id}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 10 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
            transition={{
              duration: prefersReducedMotion ? 0.01 : 0.18,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ willChange: 'transform, opacity' }}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocusCapture={() => setIsPaused(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setIsPaused(false);
              }
            }}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[#DFD1BA] bg-white p-6 text-center shadow-2xl dark:border-[#3A3E4A] dark:bg-[#22242B]"
          >
            <button
              type="button"
              onClick={closePopup}
              aria-label="ปิดหน้าต่างแจ้งเตือน"
              className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-[#66585B] hover:bg-[#FAF6EE] hover:text-[#23181A] dark:text-[#A19B91] dark:hover:bg-[#2D303A] dark:hover:text-[#F2EFEA] transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#BBF7D0] bg-[#ECFDF5] text-[#16A34A] dark:border-[#166534] dark:bg-[#143322] dark:text-[#4ADE80]"
            >
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </motion.div>

            <h3
              id="save-success-modal-title"
              className="font-display text-lg font-bold text-[#23181A] dark:text-[#F2EFEA]"
            >
              {popup.title}
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-[#5A4B4E] dark:text-[#CEC8BE]">
              {popup.message}
            </p>

            <div className="mt-5 flex justify-center">
              <button
                type="button"
                autoFocus
                onClick={closePopup}
                className="min-w-[132px] rounded-xl bg-[#7A1629] px-6 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#5B0F1D] dark:bg-[#C6922C] dark:text-[#1D1416] dark:hover:bg-[#DDA83F] transition-colors"
              >
                ตกลง
              </button>
            </div>

            {/* Smooth GPU-composited 3-second auto-close progress bar */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-1 bg-[#EFE5D4] dark:bg-[#323642]"
            >
              <motion.div
                key={`bar-${popup.id}-${isPaused ? 'paused' : 'run'}`}
                initial={{ scaleX: Math.max(0, Math.min(1, remainingMs / AUTO_CLOSE_MS)) }}
                animate={{
                  scaleX: isPaused
                    ? Math.max(0, Math.min(1, remainingMs / AUTO_CLOSE_MS))
                    : 0,
                }}
                transition={{
                  duration: isPaused ? 0 : Math.max(0.05, remainingMs / 1000),
                  ease: 'linear',
                }}
                style={{ transformOrigin: 'left', willChange: 'transform' }}
                className="h-full w-full bg-[#16A34A] dark:bg-[#4ADE80]"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <SaveSuccessContext.Provider value={{ showSaveSuccess }}>
      {children}
      {typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode}
    </SaveSuccessContext.Provider>
  );
}

export function useSaveSuccess(): SaveSuccessContextValue {
  const ctx = useContext(SaveSuccessContext);
  if (!ctx) {
    return {
      showSaveSuccess: () => {},
    };
  }
  return ctx;
}
