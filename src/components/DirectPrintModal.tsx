import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Printer, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { PdfOrientation } from '../utils/pdfHelpers';

interface DirectPrintModalProps {
  blobUrl: string;
  filename: string;
  pageCount: number;
  orientation: PdfOrientation;
  pageImages?: string[];
  onClose: () => void;
}

export function DirectPrintModal({
  blobUrl,
  filename,
  pageCount,
  orientation,
  pageImages = [],
  onClose,
}: DirectPrintModalProps) {
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [printHint, setPrintHint] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [blobUrl, onClose]);

  const printableSrcDoc = useMemo(() => {
    const pagesHtml = pageImages
      .map(
        (src, idx) =>
          `<div class="print-page"><img src="${src}" alt="หน้า ${idx + 1}" /></div>`
      )
      .join('');
    return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>${filename}</title>
<style>
  @page { size: A4 ${orientation}; margin: 10mm; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  .print-page { page-break-after: always; break-after: page; display: flex; justify-content: center; align-items: flex-start; }
  .print-page:last-child { page-break-after: auto; break-after: auto; }
  .print-page img { width: 100%; height: auto; display: block; }
</style>
</head>
<body>${pagesHtml}</body>
</html>`;
  }, [filename, orientation, pageImages]);

  const handlePrintPdfFrame = () => {
    setPrintHint(null);
    try {
      const frameWin = printFrameRef.current?.contentWindow;
      if (frameWin) {
        frameWin.focus();
        frameWin.print();
        setPrintHint(
          'ส่งคำสั่งพิมพ์ไปยังหน้าต่างเครื่องพิมพ์แล้ว หากเบราว์เซอร์บล็อกกรอบย่อย กรุณากดปุ่ม "เปิดหน้าจอพิมพ์ในแท็บใหม่" ด้านขวา'
        );
        return;
      }
    } catch {
      // Sandboxed iframe print blocked
    }
    setPrintHint(
      'เบราว์เซอร์จำกัดการสั่งพิมพ์ภายในกรอบย่อย กรุณากดปุ่ม "เปิดหน้าจอพิมพ์ในแท็บใหม่" เพื่อเปิดหน้าต่างเครื่องพิมพ์ทันที'
    );
  };

  const modalContent = (
    <motion.div
      id="direct-print-screen-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`หน้าจอสั่งพิมพ์เอกสารจริง ${filename}`}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.16, ease: [0.16, 1, 0.3, 1] }}
      style={{ willChange: 'transform, opacity' }}
      className="no-print fixed inset-0 z-[70] flex flex-col bg-[#1F1719]/92"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8CBB8] dark:border-[#343842] bg-white dark:bg-[#22242B] px-4 py-3 sm:px-6 shadow-sm">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm sm:text-base font-bold text-[#7A1629] dark:text-[#F4D98A] truncate">
              หน้าจอสั่งพิมพ์เอกสารจริง (Direct Print Screen)
            </h2>
            <span className="inline-flex items-center rounded-md border border-[#E5CFA0] dark:border-[#6A5220] bg-[#FDF8EC] dark:bg-[#2D2414] px-2 py-0.5 text-[11px] font-semibold text-[#7A1629] dark:text-[#F4D98A] tabular-nums">
              {orientation === 'landscape' ? 'A4 แนวนอน' : 'A4 แนวตั้ง'} · {pageCount} หน้า
            </span>
          </div>
          <p className="text-xs text-[#66585B] dark:text-[#A19B91] truncate mt-0.5">
            พร้อมสั่งพิมพ์ไฟล์: {filename}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7A1629] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#5B0F1D] transition-colors shadow-xs"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>เปิดหน้าจอพิมพ์ในแท็บใหม่ (Print)</span>
          </a>

          <button
            type="button"
            onClick={handlePrintPdfFrame}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#7A1629] dark:border-[#C6922C]/70 bg-[#FDF8EC] dark:bg-[#2D2414] px-3.5 py-2 text-xs font-semibold text-[#7A1629] dark:text-[#F4D98A] hover:bg-[#F7ECD1] dark:hover:bg-[#3A2E19] transition-colors"
          >
            <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>สั่งพิมพ์จากหน้านี้</span>
          </button>

          <a
            href={blobUrl}
            download={filename}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] px-3.5 py-2 text-xs font-medium text-[#23181A] dark:text-[#F2EFEA] hover:bg-[#FAF6EE] dark:hover:bg-[#2D313B] transition-colors"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>ดาวน์โหลด PDF</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าจอสั่งพิมพ์จริง"
            className="inline-flex items-center gap-1 rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] px-3 py-2 text-xs font-medium text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-[#FAF6EE] dark:hover:bg-[#2D313B] transition-colors"
          >
            <X className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>ปิด</span>
          </button>
        </div>
      </div>

      {printHint && (
        <div
          role="status"
          className="border-b border-[#E5CFA0] dark:border-[#6A5220] bg-[#FDF8EC] dark:bg-[#2D2414] px-4 py-2 text-xs text-[#7A1629] dark:text-[#F4D98A] sm:px-6"
        >
          {printHint}
        </div>
      )}

      {/* Printable A4 Sheet Stack Preview (always visible across all browsers/iframes) */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#4B4E52] dark:bg-[#141519] p-4 sm:p-8">
        {pageImages.length > 0 ? (
          <div className="mx-auto space-y-6">
            {pageImages.map((src, index) => (
              <div
                key={`print-page-${index + 1}`}
                className={`mx-auto rounded-sm bg-white p-3 sm:p-5 shadow-2xl ${
                  orientation === 'landscape' ? 'max-w-[1060px]' : 'max-w-[794px]'
                }`}
              >
                <div className="mb-2 flex items-center justify-between border-b border-[#F0E8D8] pb-1.5 text-[11px] font-medium text-[#66585B] tabular-nums">
                  <span>{filename}</span>
                  <span>
                    หน้า {index + 1} / {pageImages.length}
                  </span>
                </div>
                <img
                  src={src}
                  alt={`เอกสารเตรียมพิมพ์ หน้า ${index + 1}`}
                  className="w-full h-auto block"
                />
              </div>
            ))}
          </div>
        ) : (
          <iframe
            src={blobUrl}
            title={`เอกสารเตรียมพิมพ์ ${filename}`}
            className="h-full w-full border-0 bg-white rounded"
          />
        )}
      </div>

      {/* Hidden printable frame for direct in-page print trigger */}
      {pageImages.length > 0 && (
        <iframe
          ref={printFrameRef}
          srcDoc={printableSrcDoc}
          title="Hidden Printable Frame"
          className="hidden"
          aria-hidden="true"
        />
      )}
    </motion.div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
