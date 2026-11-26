import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface SaveSuccessPayload {
  title: string;
  message: string;
}

interface SaveSuccessContextValue {
  showSaveSuccess: (message?: string, title?: string) => void;
}

const SaveSuccessContext = createContext<SaveSuccessContextValue | null>(null);

export function SaveSuccessProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<SaveSuccessPayload | null>(null);

  const showSaveSuccess = useCallback(
    (
      message = 'ข้อมูลถูกบันทึกลงในระบบเรียบร้อยแล้ว',
      title = 'บันทึกข้อมูลเสร็จสิ้นแล้ว'
    ) => {
      setPopup({ title, message });
    },
    []
  );

  const closePopup = useCallback(() => {
    setPopup(null);
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

  const modalNode = (
    <AnimatePresence>
      {popup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-success-modal-title"
          className="no-print fixed inset-0 z-[90] flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePopup();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm rounded-2xl border border-[#DFD1BA] bg-white p-6 text-center shadow-2xl dark:border-[#3A3E4A] dark:bg-[#22242B]"
          >
            <button
              type="button"
              onClick={closePopup}
              aria-label="ปิดหน้าต่างแจ้งเตือน"
              className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-[#66585B] hover:bg-[#FAF6EE] hover:text-[#23181A] dark:text-[#A19B91] dark:hover:bg-[#2D303A] dark:hover:text-[#F2EFEA] transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#BBF7D0] bg-[#ECFDF5] text-[#16A34A] dark:border-[#166534] dark:bg-[#143322] dark:text-[#4ADE80]">
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>

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
          </motion.div>
        </div>
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
