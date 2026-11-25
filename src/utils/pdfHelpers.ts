export type PdfOrientation = 'portrait' | 'landscape';

export interface PdfPageSlice {
  pageNumber: number;
  sourceY: number;
  sourceHeight: number;
  destHeightMm: number;
}

export interface A4PageDimensionsMm {
  orientation: PdfOrientation;
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
}

export function getA4PageDimensionsMm(
  orientation: PdfOrientation = 'portrait',
  marginMm = 10
): A4PageDimensionsMm {
  const safeMargin = Math.max(0, Math.min(marginMm, 25));
  const pageWidthMm = orientation === 'landscape' ? 297 : 210;
  const pageHeightMm = orientation === 'landscape' ? 210 : 297;
  return {
    orientation,
    pageWidthMm,
    pageHeightMm,
    marginMm: safeMargin,
    contentWidthMm: pageWidthMm - safeMargin * 2,
    contentHeightMm: pageHeightMm - safeMargin * 2,
  };
}

export function computeFitAllColumnsScale(
  tableWidthPx: number,
  targetPageWidthPx: number
): number {
  if (!Number.isFinite(tableWidthPx) || !Number.isFinite(targetPageWidthPx)) {
    return 1;
  }
  if (tableWidthPx <= 0 || targetPageWidthPx <= 0) {
    return 1;
  }
  if (tableWidthPx <= targetPageWidthPx) {
    return 1;
  }
  return Number(Math.max(0.45, targetPageWidthPx / tableWidthPx).toFixed(4));
}

export function sanitizePdfFilenamePart(raw: string, fallback = 'document'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function buildStudentProfilePdfFilename(
  studentId?: string,
  academicYear?: string
): string {
  const idPart = sanitizePdfFilenamePart(studentId || '', 'student');
  const yearPart = sanitizePdfFilenamePart(academicYear || '', '');
  return yearPart
    ? `edu-social-care-profile-${idPart}-${yearPart}.pdf`
    : `edu-social-care-profile-${idPart}.pdf`;
}

export function buildSummaryReportPdfFilename(
  academicYear?: string,
  yearLevel?: string
): string {
  const yearPart =
    !academicYear || academicYear === 'all'
      ? 'all-years'
      : sanitizePdfFilenamePart(academicYear, 'year');
  const levelMap: Record<string, string> = {
    'ปี 1': 'y1',
    'ปี 2': 'y2',
    'ปี 3': 'y3',
    'ปี 4': 'y4',
  };
  const levelPart =
    !yearLevel || yearLevel === 'all'
      ? ''
      : `-${levelMap[yearLevel] || sanitizePdfFilenamePart(yearLevel, 'level')}`;
  return `edu-social-care-report-${yearPart}${levelPart}.pdf`;
}

export function computePdfPaginationSlices(params: {
  canvasWidth: number;
  canvasHeight: number;
  orientation?: PdfOrientation;
  marginMm?: number;
  contentWidthMm?: number;
  contentHeightMm?: number;
}): PdfPageSlice[] {
  const dims = getA4PageDimensionsMm(params.orientation ?? 'portrait', params.marginMm ?? 10);
  const {
    canvasWidth,
    canvasHeight,
    contentWidthMm = dims.contentWidthMm,
    contentHeightMm = dims.contentHeightMm,
  } = params;

  if (canvasWidth <= 0 || canvasHeight <= 0 || contentWidthMm <= 0 || contentHeightMm <= 0) {
    return [];
  }

  const pxPerMm = canvasWidth / contentWidthMm;
  const maxSlicePx = Math.max(1, Math.floor(contentHeightMm * pxPerMm));
  const slices: PdfPageSlice[] = [];

  let offsetY = 0;
  let pageNumber = 1;
  while (offsetY < canvasHeight) {
    const remaining = canvasHeight - offsetY;
    const slicePx = Math.min(maxSlicePx, remaining);
    const destHeightMm = Number((slicePx / pxPerMm).toFixed(2));
    slices.push({
      pageNumber,
      sourceY: offsetY,
      sourceHeight: slicePx,
      destHeightMm,
    });
    offsetY += slicePx;
    pageNumber += 1;
  }

  return slices;
}
