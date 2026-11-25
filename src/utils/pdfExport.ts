import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  computePdfPaginationSlices,
  getA4PageDimensionsMm,
  type PdfOrientation,
} from './pdfHelpers';

export interface ExportPdfOptions {
  orientation?: PdfOrientation;
  marginMm?: number;
  fitAllColumns?: boolean;
}

async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          img.removeEventListener('load', done);
          img.removeEventListener('error', done);
          resolve();
        };
        img.addEventListener('load', done);
        img.addEventListener('error', done);
      });
    })
  );
}

function measureUnclippedTableWidth(element: HTMLElement, minWidthPx: number): number {
  let maxWidth = Math.max(minWidthPx, element.scrollWidth, element.offsetWidth);
  const tables = element.querySelectorAll('table');
  tables.forEach((table) => {
    const scrollW = (table as HTMLElement).scrollWidth;
    if (scrollW > 0) {
      maxWidth = Math.max(maxWidth, scrollW + 32);
    }
  });
  return maxWidth;
}

async function buildElementPdfDocument(
  element: HTMLElement,
  filename: string,
  options: ExportPdfOptions = {},
  autoPrint = false
): Promise<{
  pdf: jsPDF;
  safeName: string;
  pageCount: number;
  orientation: PdfOrientation;
  pageImages: string[];
}> {
  const orientation: PdfOrientation = options.orientation ?? 'portrait';
  const marginMm = options.marginMm ?? 10;
  const fitAllColumns = options.fitAllColumns ?? true;

  if (typeof document !== 'undefined' && 'fonts' in document) {
    await document.fonts.ready.catch(() => {});
  }
  await waitForImages(element);

  const minA4CssWidth = orientation === 'landscape' ? 1060 : 760;
  const initialCaptureWidth = fitAllColumns
    ? measureUnclippedTableWidth(element, minA4CssWidth)
    : Math.max(minA4CssWidth, element.offsetWidth);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: Math.max(1280, initialCaptureWidth + 80),
    onclone: (clonedDoc, clonedElement) => {
      clonedDoc.querySelectorAll('.no-print').forEach((node) => {
        (node as HTMLElement).style.display = 'none';
      });
      clonedDoc.querySelectorAll('.print-only').forEach((node) => {
        (node as HTMLElement).style.display = 'block';
      });

      const target = clonedElement as HTMLElement;
      target.style.transform = 'none';
      target.style.boxShadow = 'none';
      target.style.border = 'none';
      target.style.borderRadius = '0';
      target.style.maxWidth = 'none';
      target.style.overflow = 'visible';

      if (fitAllColumns) {
        target.querySelectorAll('.overflow-x-auto, .pdf-fit-table-wrap').forEach((wrap) => {
          const el = wrap as HTMLElement;
          el.style.overflow = 'visible';
          el.style.overflowX = 'visible';
          el.style.maxWidth = 'none';
          el.style.width = '100%';
        });

        let widestTable = minA4CssWidth;
        target.querySelectorAll('table').forEach((tbl) => {
          const tableEl = tbl as HTMLElement;
          tableEl.style.width = '100%';
          tableEl.style.maxWidth = 'none';
          tableEl.style.tableLayout = 'auto';
          widestTable = Math.max(widestTable, tableEl.scrollWidth + 24);
        });

        const finalSheetWidth = Math.max(minA4CssWidth, widestTable);
        target.style.width = `${finalSheetWidth}px`;
      }
    },
  });

  const { pageWidthMm, contentWidthMm, contentHeightMm } = getA4PageDimensionsMm(
    orientation,
    marginMm
  );

  const slices = computePdfPaginationSlices({
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    orientation,
    marginMm,
    contentWidthMm,
    contentHeightMm,
  });

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  if (autoPrint) {
    pdf.autoPrint({ variant: 'non-conform' });
  }

  const sliceCanvas = document.createElement('canvas');
  sliceCanvas.width = canvas.width;
  const sliceCtx = sliceCanvas.getContext('2d');
  if (!sliceCtx) {
    throw new Error('ไม่สามารถเตรียมพื้นที่สร้างไฟล์ PDF ได้');
  }

  const pageImages: string[] = [];

  for (let i = 0; i < slices.length; i += 1) {
    const slice = slices[i];
    sliceCanvas.height = slice.sourceHeight;
    sliceCtx.fillStyle = '#ffffff';
    sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceCtx.drawImage(
      canvas,
      0,
      slice.sourceY,
      canvas.width,
      slice.sourceHeight,
      0,
      0,
      canvas.width,
      slice.sourceHeight
    );

    const imgData = sliceCanvas.toDataURL('image/png');
    pageImages.push(imgData);
    if (i > 0) {
      pdf.addPage('a4', orientation);
    }
    pdf.addImage(
      imgData,
      'PNG',
      marginMm,
      marginMm,
      contentWidthMm,
      slice.destHeightMm,
      undefined,
      'FAST'
    );
  }

  if (pageWidthMm <= 0) {
    throw new Error('ขนาดหน้ากระดาษ A4 ไม่ถูกต้อง');
  }

  const safeName = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
  return {
    pdf,
    safeName,
    pageCount: Math.max(1, slices.length),
    orientation,
    pageImages,
  };
}

export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
  options: ExportPdfOptions = {}
): Promise<{ filename: string; pageCount: number; orientation: PdfOrientation }> {
  const { pdf, safeName, pageCount, orientation } = await buildElementPdfDocument(
    element,
    filename,
    options,
    false
  );
  pdf.save(safeName);
  return { filename: safeName, pageCount, orientation };
}

export async function exportElementToPdfBlobUrl(
  element: HTMLElement,
  filename: string,
  options: ExportPdfOptions = {}
): Promise<{
  blobUrl: string;
  filename: string;
  pageCount: number;
  orientation: PdfOrientation;
  pageImages: string[];
}> {
  const { pdf, safeName, pageCount, orientation, pageImages } = await buildElementPdfDocument(
    element,
    filename,
    options,
    true
  );
  const blob = pdf.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename: safeName, pageCount, orientation, pageImages };
}
