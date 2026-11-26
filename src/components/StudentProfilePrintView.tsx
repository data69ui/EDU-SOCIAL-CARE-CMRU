import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, FileCheck2, Loader2, Printer, X } from 'lucide-react';
import type { StudentFullRecord, UserAccount } from '../types/scholarship';
import { exportElementToPdf, exportElementToPdfBlobUrl } from '../utils/pdfExport';
import {
  buildStudentProfilePdfFilename,
  type PdfOrientation,
} from '../utils/pdfHelpers';
import {
  calculateApprovedVolunteerHours,
  formatReceivedScholarshipsText,
  formatStructuredAddress,
  getApplicationStatusMeta,
  resolveAdvisorDisplayName,
  sanitizeReceivedScholarships,
} from '../utils/scholarshipLogic';
import { DirectPrintModal } from './DirectPrintModal';
import { DriveImage } from './DriveMedia';

interface StudentProfilePrintViewProps {
  record: StudentFullRecord;
  onClose: () => void;
  currentUser?: UserAccount | null;
  teacherNames?: string[];
}

export function StudentProfilePrintView({
  record,
  onClose,
  currentUser,
  teacherNames,
}: StudentProfilePrintViewProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [orientation, setOrientation] = useState<PdfOrientation>('portrait');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [preparingDirectPrint, setPreparingDirectPrint] = useState(false);
  const [directPrintData, setDirectPrintData] = useState<{
    blobUrl: string;
    filename: string;
    pageCount: number;
    orientation: PdfOrientation;
    pageImages: string[];
  } | null>(null);
  const [pdfFeedback, setPdfFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    document.body.classList.add('printing-profile-modal');
    return () => {
      document.body.classList.remove('printing-profile-modal');
    };
  }, []);

  const { user, basicInfo, application, grades, volunteers } = record;
  const statusMeta = getApplicationStatusMeta(application?.status);
  const volSummary = calculateApprovedVolunteerHours(volunteers);
  const effectiveStudentId =
    application?.studentId || basicInfo.studentId || user.studentId || user.username;
  const effectiveYear = application?.academicYear || basicInfo.academicYear;
  const effectiveFullName = application?.fullName || basicInfo.fullName || user.fullName;

  const advisorDisplayName = resolveAdvisorDisplayName({
    reviewedBy: application?.reviewedBy,
    currentUserRole: currentUser?.role,
    currentUserName: currentUser?.fullName,
    registeredTeacherNames: teacherNames,
  });

  const receivedScholarshipItems =
    basicInfo.hasOtherScholarship === 'ได้รับทุน'
      ? sanitizeReceivedScholarships(basicInfo.receivedScholarships, basicInfo.otherScholarshipDetail)
      : [];

  const registeredAddrText = formatStructuredAddress(
    application?.registeredAddress,
    basicInfo.registeredAddress
  );
  const currentAddrText = formatStructuredAddress(
    application?.currentAddress,
    basicInfo.currentAddress
  );

  const father = {
    fullName: application?.father?.fullName || basicInfo.father.fullName,
    status: application?.father?.status || basicInfo.father.status,
    age: application?.father?.age || basicInfo.father.age,
    occupation: application?.father?.occupation || basicInfo.father.occupation,
    workplace: application?.father?.workplace || basicInfo.father.workplace,
    monthlyIncome: application?.father?.monthlyIncome || basicInfo.father.monthlyIncome,
    phone: application?.father?.phone || basicInfo.father.phone,
  };

  const mother = {
    fullName: application?.mother?.fullName || basicInfo.mother.fullName,
    status: application?.mother?.status || basicInfo.mother.status,
    age: application?.mother?.age || basicInfo.mother.age,
    occupation: application?.mother?.occupation || basicInfo.mother.occupation,
    workplace: application?.mother?.workplace || basicInfo.mother.workplace,
    monthlyIncome: application?.mother?.monthlyIncome || basicInfo.mother.monthlyIncome,
    phone: application?.mother?.phone || basicInfo.mother.phone,
  };

  const guardian = {
    fullName: application?.guardian?.fullName || basicInfo.guardian?.fullName || '',
    relationship: application?.guardian?.relationship || basicInfo.guardian?.relationship || '',
    status: application?.guardian?.status || basicInfo.guardian?.status || '',
    age: application?.guardian?.age || basicInfo.guardian?.age || '',
    occupation: application?.guardian?.occupation || basicInfo.guardian?.occupation || '',
    workplace: application?.guardian?.workplace || basicInfo.guardian?.workplace || '',
    monthlyIncome: application?.guardian?.monthlyIncome || basicInfo.guardian?.monthlyIncome || '',
    phone: application?.guardian?.phone || basicInfo.guardian?.phone || '',
  };

  const formatDateTimeLabel = (iso?: string) => {
    if (!iso) return '-';
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return iso;
    return new Date(ms).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const livingWithText =
    application?.currentlyLivingWith ||
    (basicInfo.livingWith === 'อื่นๆ' ? basicInfo.livingWithOther : basicInfo.livingWith) ||
    '-';

  const maritalStatusText = application?.parentsMaritalStatus
    ? application.parentsMaritalStatus === 'อื่นๆ' && application.parentsMaritalStatusOther
      ? `${application.parentsMaritalStatus} (${application.parentsMaritalStatusOther})`
      : application.parentsMaritalStatus
    : basicInfo.parentsMaritalStatus === 'อื่นๆ' && basicInfo.parentsMaritalStatusOther
      ? `${basicInfo.parentsMaritalStatus} (${basicInfo.parentsMaritalStatusOther})`
      : basicInfo.parentsMaritalStatus || '-';

  const sponsorText = application?.financialSponsorName
    ? `${application.financialSponsorName} (${
        application.financialSponsorRelation === 'อื่นๆ' && application.financialSponsorRelationOther
          ? application.financialSponsorRelationOther
          : application.financialSponsorRelation
      })`
    : '-';

  const housingText = application?.housingStatus
    ? application.housingStatus === 'อื่นๆ' && application.housingStatusOther
      ? `${application.housingStatus} (${application.housingStatusOther})`
      : application.housingStatus
    : '-';

  const handleDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setDownloadingPdf(true);
    setPdfFeedback(null);
    try {
      const filename = buildStudentProfilePdfFilename(effectiveStudentId, effectiveYear);
      const res = await exportElementToPdf(sheetRef.current, filename, {
        orientation,
        fitAllColumns: true,
      });
      setPdfFeedback({
        type: 'success',
        text: `ดาวน์โหลดไฟล์ ${res.filename} (${res.pageCount} หน้า · ${
          orientation === 'landscape' ? 'A4 แนวนอน' : 'A4 แนวตั้ง'
        } · Fit All Columns) เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setPdfFeedback({
        type: 'error',
        text: (err as Error).message || 'ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDirectPrint = async () => {
    if (!sheetRef.current || preparingDirectPrint) return;
    setPdfFeedback(null);

    let nativePrintTriggered = false;
    const onBeforePrint = () => {
      nativePrintTriggered = true;
    };
    window.addEventListener('beforeprint', onBeforePrint, { once: true });

    const isEmbeddedFrame = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    try {
      window.print();
    } catch {
      // Blocked by sandboxed iframe
    }

    await new Promise((resolve) => setTimeout(resolve, isEmbeddedFrame ? 140 : 220));
    window.removeEventListener('beforeprint', onBeforePrint);

    if (nativePrintTriggered && !isEmbeddedFrame) {
      return;
    }

    setPreparingDirectPrint(true);
    try {
      const filename = buildStudentProfilePdfFilename(effectiveStudentId, effectiveYear);
      const res = await exportElementToPdfBlobUrl(sheetRef.current, filename, {
        orientation,
        fitAllColumns: true,
      });
      setDirectPrintData(res);
    } catch (err) {
      setPdfFeedback({
        type: 'error',
        text: (err as Error).message || 'ไม่สามารถเปิดหน้าจอสั่งพิมพ์ได้ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setPreparingDirectPrint(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ตัวอย่างหน้าก่อนพิมพ์เอกสารสรุปประวัตินักศึกษาขอรับทุนการศึกษา"
      className="printing-profile-root fixed inset-0 z-50 overflow-y-auto bg-black/65 p-3 sm:p-5 print:static print:bg-white print:p-0"
    >
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 10mm; } }`}</style>

      <div className="mx-auto max-w-[1140px] rounded-2xl bg-[#FAF6EE] p-4 sm:p-6 shadow-2xl border border-[#DFD1BA] print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none space-y-4">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DFD1BA] bg-white px-4 py-3.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#7A1629]">
                ตัวอย่างหน้าก่อนพิมพ์จริง (Print Preview)
              </h2>
              <span className="inline-flex items-center gap-1 rounded-md border border-[#E5CFA0] bg-[#FDF8EC] px-2 py-0.5 text-[11px] font-semibold text-[#7A1629]">
                <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                Fit All Columns on One Page
              </span>
            </div>
            <p className="text-xs text-[#66585B] mt-0.5">
              ตรวจสอบข้อมูลทั้งหมดบนเอกสารขนาด{' '}
              {orientation === 'landscape'
                ? 'A4 แนวนอน (297 × 210 มม.)'
                : 'A4 แนวตั้ง (210 × 297 มม.)'}{' '}
              ก่อนสั่งพิมพ์หรือดาวน์โหลด PDF
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="เลือกแนวกระดาษ A4"
              className="inline-flex rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] p-0.5 text-xs"
            >
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                  orientation === 'portrait'
                    ? 'bg-[#7A1629] text-white'
                    : 'text-[#5A4B4E] hover:text-[#23181A]'
                }`}
              >
                A4 แนวตั้ง
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                  orientation === 'landscape'
                    ? 'bg-[#7A1629] text-white'
                    : 'text-[#5A4B4E] hover:text-[#23181A]'
                }`}
              >
                A4 แนวนอน
              </button>
            </div>

            <button
              type="button"
              disabled={downloadingPdf || preparingDirectPrint}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5B0F1D] transition-colors disabled:opacity-60"
            >
              {downloadingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{downloadingPdf ? 'กำลังสร้างไฟล์ PDF...' : 'ดาวน์โหลดไฟล์ PDF'}</span>
            </button>

            <button
              type="button"
              disabled={preparingDirectPrint || downloadingPdf}
              onClick={handleDirectPrint}
              className="inline-flex items-center gap-2 rounded-lg border border-[#7A1629] bg-white px-4 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#FAF6EE] transition-colors disabled:opacity-60"
            >
              {preparingDirectPrint ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Printer className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{preparingDirectPrint ? 'กำลังเปิดหน้าจอพิมพ์...' : 'สั่งพิมพ์จริง (Print)'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างพิมพ์"
              className="rounded-lg border border-[#D8CBB8] bg-white p-2 text-[#5A4B4E] hover:bg-[#FAF6EE]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {pdfFeedback && (
          <div
            role={pdfFeedback.type === 'error' ? 'alert' : 'status'}
            className={`no-print flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium ${
              pdfFeedback.type === 'error'
                ? 'border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#86EFAC] bg-[#F0FDF4] text-[#166534]'
            }`}
          >
            {pdfFeedback.type === 'success' && (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{pdfFeedback.text}</span>
          </div>
        )}

        {/* Real A4 Paper Preview Desk */}
        <div className="a4-preview-desk rounded-xl border border-[#DFD1BA] bg-[#E8DFCE] p-3 sm:p-6 overflow-x-auto print:border-0 print:bg-white print:p-0">
          {/* Official A4 Document Content */}
          <div
            id="student-profile-print-sheet"
            ref={sheetRef}
            className={`a4-paper-sheet mx-auto space-y-5 bg-white p-6 sm:p-8 text-[13px] leading-relaxed text-[#111827] border border-[#D8CBB8] shadow-lg print:border-0 print:shadow-none print:p-0 ${
              orientation === 'landscape' ? 'w-full max-w-[1060px]' : 'w-full max-w-[794px]'
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b-2 border-[#7A1629] pb-4">
              <div className="flex items-center gap-4">
                <img
                  src="/assets/aistudio/image_7437b452.png"
                  alt="ตราสัญลักษณ์ EDU SOCIAL CARE CMRU"
                  referrerPolicy="no-referrer"
                  className="h-16 w-auto max-w-[160px] rounded-lg border border-[#D8C6A6] bg-white px-2 py-1 object-contain"
                />
                <div>
                  <h1 className="font-display text-lg font-bold text-[#7A1629]">
                    แบบข้อมูลประวัตินักศึกษาและคำร้องขอรับทุนการศึกษา
                  </h1>
                  <p className="text-xs text-[#4B5563]">
                    งานทุนการศึกษา &amp; กยศ. สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
                  </p>
                  <p className="text-xs text-[#7A1629] font-medium mt-0.5">
                    EDU SOCIAL CARE CMRU · Your Education, Our Care.
                  </p>
                </div>
              </div>

              {basicInfo.profilePhoto && (
                <DriveImage
                  src={basicInfo.profilePhoto.url}
                  driveFileId={basicInfo.profilePhoto.driveFileId}
                  alt="รูปถ่ายนักศึกษา"
                  className="h-24 w-20 rounded border border-[#9CA3AF] object-cover shrink-0"
                />
              )}
            </div>

            {/* Section 1: Student & Personal Info */}
            <section className="space-y-2 border-b border-[#E5E7EB] pb-4">
              <h2 className="font-display text-sm font-bold text-[#7A1629]">
                1. ข้อมูลนักศึกษาและรายละเอียดส่วนตัว
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <p>
                  <strong>ชื่อ-นามสกุล:</strong> {effectiveFullName || '-'}
                </p>
                <p className="tabular-nums">
                  <strong>รหัสนักศึกษา:</strong> {effectiveStudentId || '-'}
                </p>
                <p>
                  <strong>ปีการศึกษา / ชั้นปี:</strong> {effectiveYear} /{' '}
                  {application?.yearLevel || basicInfo.yearLevel || '-'}
                </p>
                <p>
                  <strong>หมู่เรียน / รุ่น:</strong>{' '}
                  {application?.yearAndSection || basicInfo.cohort || '-'}
                </p>
                <p className="tabular-nums">
                  <strong>GPAX:</strong> {application?.gpax || basicInfo.gpax || '-'} (ภาค 1:{' '}
                  {basicInfo.gpaTerm1 || '-'} / ภาค 2: {basicInfo.gpaTerm2 || '-'})
                </p>
                <p className="tabular-nums">
                  <strong>วันเกิด / อายุ:</strong> {application?.birthDate || basicInfo.birthDate || '-'}{' '}
                  ({application?.age || basicInfo.age || '-'} ปี)
                </p>
                <p>
                  <strong>สัญชาติ / เชื้อชาติ / ศาสนา:</strong>{' '}
                  {application?.nationality || basicInfo.nationality || '-'} /{' '}
                  {application?.ethnicity || basicInfo.ethnicity || '-'} /{' '}
                  {application?.religion || basicInfo.religion || '-'}
                </p>
                <p className="tabular-nums">
                  <strong>โทรศัพท์ / Facebook:</strong>{' '}
                  {application?.phone || basicInfo.phone || '-'} ·{' '}
                  {application?.facebook || basicInfo.facebook || '-'}
                </p>
                <p>
                  <strong>บัญชีผู้ใช้ / อีเมล:</strong> {basicInfo.email || user.email || user.username}
                </p>
                <p className="tabular-nums">
                  <strong>ค่าใช้จ่ายต่อเดือน:</strong>{' '}
                  {application?.monthlyExpenses || basicInfo.monthlyAllowance
                    ? `${application?.monthlyExpenses || basicInfo.monthlyAllowance} บาท`
                    : '-'}
                </p>
                <p>
                  <strong>ผู้อุปการะทางการเงิน:</strong> {sponsorText}
                </p>
                <p>
                  <strong>ลักษณะที่อยู่อาศัย:</strong> {housingText}
                </p>
                <p>
                  <strong>ปัจจุบันอาศัยอยู่กับ:</strong> {livingWithText}
                </p>
                <p className="tabular-nums">
                  <strong>สมาชิกในครัวเรือน:</strong>{' '}
                  {application?.householdMembersCount || basicInfo.familyMemberCount || '-'} คน
                </p>
                <p>
                  <strong>โรคประจำตัว:</strong>{' '}
                  {application?.hasChronicDisease || basicInfo.hasChronicDisease || 'ไม่มี'}
                  {(application?.chronicDiseaseDetail || basicInfo.chronicDiseaseDetail) &&
                    ` (${application?.chronicDiseaseDetail || basicInfo.chronicDiseaseDetail})`}
                </p>
                <p>
                  <strong>การทำงานพิเศษ:</strong>{' '}
                  {application?.hasPartTimeJob || basicInfo.hasPartTimeJob || 'ไม่ทำ'}
                  {(application?.partTimeJobDetailIncome || basicInfo.partTimeJobDetail) &&
                    ` (${application?.partTimeJobDetailIncome || basicInfo.partTimeJobDetail})`}
                </p>
                <p className="col-span-2">
                  <strong>ที่อยู่ตามทะเบียนบ้าน:</strong> {registeredAddrText}
                </p>
                <p className="col-span-2">
                  <strong>ที่อยู่ปัจจุบัน:</strong> {currentAddrText}
                </p>
              </div>
            </section>

            {/* Section 2: All Scholarships & Application Overview */}
            <section className="space-y-2 border-b border-[#E5E7EB] pb-4">
              <h2 className="font-display text-sm font-bold text-[#7A1629]">
                2. ข้อมูลทุนการศึกษาที่ได้รับและสถานะคำร้องทั้งหมด
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <p>
                  <strong>การกู้ยืม กยศ.:</strong> {basicInfo.hasStudentLoan}{' '}
                  {basicInfo.studentLoanYear ? `(ปีที่กู้ ${basicInfo.studentLoanYear})` : ''}
                  {application?.hasStudentLoan ? ` · คำร้อง: ${application.hasStudentLoan}` : ''}
                </p>
                <p>
                  <strong>สถานะคำร้องขอรับทุน:</strong> {statusMeta.label}
                </p>
                <p>
                  <strong>วันที่ยื่นคำร้อง:</strong> {formatDateTimeLabel(application?.submittedAt)}
                </p>
                <p>
                  <strong>อาจารย์ผู้พิจารณา / วันที่พิจารณา:</strong>{' '}
                  {advisorDisplayName || 'ยังไม่มีข้อมูลอาจารย์'}
                  {application?.reviewedAt ? ` (${formatDateTimeLabel(application.reviewedAt)})` : ''}
                </p>
              </div>

              <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-3 space-y-1.5">
                <p className="font-semibold text-[#23181A]">
                  รายการทุนการศึกษาที่ได้รับทั้งหมด (จากประวัติส่วนตัว):{' '}
                  <span className="font-normal">
                    {basicInfo.hasOtherScholarship === 'ได้รับทุน'
                      ? receivedScholarshipItems.length > 0
                        ? `ได้รับทุน ${receivedScholarshipItems.length} รายการ`
                        : formatReceivedScholarshipsText(basicInfo) || 'ได้รับทุน'
                      : 'ไม่ได้รับทุน'}
                  </span>
                </p>
                {receivedScholarshipItems.length > 0 && (
                  <ol className="list-decimal pl-5 space-y-0.5 text-xs text-[#1F2937]">
                    {receivedScholarshipItems.map((item) => (
                      <li key={item.id}>
                        <span className="font-semibold">{item.name}</span>
                        {item.provider ? (
                          <span className="text-[#4B5563]"> — หน่วยงาน/แหล่งทุน: {item.provider}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}

                {application && (
                  <p className="text-xs text-[#374151] pt-1 border-t border-[#E5E7EB]">
                    <strong>ข้อมูลทุนที่ระบุในแบบคำร้องขอรับทุน:</strong>{' '}
                    {application.hasOtherScholarship}
                    {application.otherScholarshipNameAmount
                      ? ` — ${application.otherScholarshipNameAmount}`
                      : ''}
                  </p>
                )}
              </div>
            </section>

            {/* Section 3: Family & Guardian */}
            <section className="space-y-2 border-b border-[#E5E7EB] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold text-[#7A1629]">
                  3. ข้อมูลครอบครัวและผู้ปกครอง
                </h2>
                <span className="text-xs text-[#4B5563]">
                  สถานภาพบิดา-มารดา: <strong>{maritalStatusText}</strong>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-0.5">
                  <h3 className="font-display font-bold text-[#7A1629]">ข้อมูลบิดา</h3>
                  <p>
                    ชื่อ: {father.fullName || '-'} ({father.status || '-'}
                    {father.age ? `, อายุ ${father.age} ปี` : ''})
                  </p>
                  <p>
                    อาชีพ: {father.occupation || '-'} · สถานที่ทำงาน: {father.workplace || '-'}
                  </p>
                  <p className="tabular-nums">
                    รายได้: {father.monthlyIncome || '0'} บาท/เดือน · โทร: {father.phone || '-'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <h3 className="font-display font-bold text-[#7A1629]">ข้อมูลมารดา</h3>
                  <p>
                    ชื่อ: {mother.fullName || '-'} ({mother.status || '-'}
                    {mother.age ? `, อายุ ${mother.age} ปี` : ''})
                  </p>
                  <p>
                    อาชีพ: {mother.occupation || '-'} · สถานที่ทำงาน: {mother.workplace || '-'}
                  </p>
                  <p className="tabular-nums">
                    รายได้: {mother.monthlyIncome || '0'} บาท/เดือน · โทร: {mother.phone || '-'}
                  </p>
                </div>
                {(guardian.fullName || guardian.relationship) && (
                  <div className="col-span-2 space-y-0.5 pt-2 border-t border-[#F3F4F6]">
                    <h3 className="font-display font-bold text-[#7A1629]">
                      ข้อมูลผู้ปกครอง ({guardian.relationship || 'ผู้ดูแล'})
                    </h3>
                    <p>
                      ชื่อ: {guardian.fullName || '-'} ({guardian.status || '-'}
                      {guardian.age ? `, อายุ ${guardian.age} ปี` : ''}) · อาชีพ:{' '}
                      {guardian.occupation || '-'} · สถานที่ทำงาน: {guardian.workplace || '-'} ·
                      รายได้: {guardian.monthlyIncome || '0'} บาท/เดือน · โทร:{' '}
                      {guardian.phone || '-'}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Section 4: Financial Problems & Necessity */}
            <section className="space-y-1.5 border-b border-[#E5E7EB] pb-4">
              <h2 className="font-display text-sm font-bold text-[#7A1629]">
                4. สภาพปัญหาทางการเงิน เหตุผลความจำเป็น และแผนการใช้ทุน
              </h2>
              <p>
                <strong>สภาพปัญหาทางการเงิน:</strong> {application?.financialProblemDetail || '-'}
              </p>
              <p>
                <strong>เหตุผลความจำเป็น:</strong>{' '}
                {application?.scholarshipNecessityDetail || basicInfo.necessityReason || '-'}
              </p>
              <p>
                <strong>ประโยชน์/แผนการใช้ทุน:</strong>{' '}
                {application?.expectedBenefitDetail || basicInfo.spendingPlan || '-'}
              </p>
              <p>
                <strong>ความเห็นอาจารย์ผู้พิจารณา:</strong> {application?.advisorComment || '-'}
              </p>
            </section>

            {/* Section 5: Grades, Volunteers & Document Attachments */}
            <section className="grid grid-cols-2 gap-6 border-b border-[#E5E7EB] pb-4">
              <div>
                <h2 className="font-display text-sm font-bold text-[#7A1629] mb-1">
                  5. ประวัติผลการเรียนที่บันทึก ({grades.length} รายการ)
                </h2>
                {grades.length === 0 ? (
                  <p className="text-xs text-[#6B7280]">ไม่มีข้อมูล</p>
                ) : (
                  <ul className="space-y-1 text-xs tabular-nums">
                    {grades.map((g) => (
                      <li key={g.id}>
                        ปี {g.academicYear} · {g.yearLevel} · {g.semester}:{' '}
                        <strong>GPA {g.gpa}</strong>{' '}
                        {g.attachments.length > 0 ? `(แนบ ${g.attachments.length} ไฟล์)` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h2 className="font-display text-sm font-bold text-[#7A1629] mb-1">
                  6. สรุปจิตอาสาและเอกสารประกอบ
                </h2>
                <p className="text-xs tabular-nums">
                  จิตอาสาอนุมัติแล้ว: <strong>{volSummary.approvedHours} ชั่วโมง</strong> · รอพิจารณา:{' '}
                  {volSummary.pendingHours} ชั่วโมง ({volunteers.length} กิจกรรม)
                </p>
                {volunteers.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-[#374151]">
                    {volunteers.map((v) => (
                      <li key={v.id}>
                        • {v.activityDate}: {v.activityTitle} ({v.hours} ชม. ·{' '}
                        {v.approvalStatus === 'approved'
                          ? 'อนุมัติ'
                          : v.approvalStatus === 'rejected'
                            ? 'ไม่อนุมัติ'
                            : 'รอตรวจ'}
                        )
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs mt-1.5 text-[#374151]">
                  <strong>ไฟล์แนบ:</strong> ภาพบ้าน (ข้อมูลพื้นฐาน) {basicInfo.housePhotos.length}{' '}
                  ภาพ, เอกสารรับรอง {basicInfo.supportingDocs.length} ไฟล์
                  {application &&
                    `, ภาพประกอบคำร้อง ${
                      application.indoorHousePhotos.length +
                      application.indoorFamilyPhotos.length +
                      application.outdoorHousePhotos.length +
                      application.outdoorFamilyPhotos.length
                    } ภาพ`}
                </p>
                {basicInfo.documentNote && (
                  <p className="text-xs text-[#4B5563]">
                    <strong>หมายเหตุเอกสาร:</strong> {basicInfo.documentNote}
                  </p>
                )}
              </div>
            </section>

            {/* Section 6: Straight, Centered Official Signature Block */}
            <div
              data-testid="profile-signature-block"
              className="grid grid-cols-2 gap-10 pt-8 pb-2 text-xs text-[#111827] break-inside-avoid"
            >
              <div className="flex flex-col items-center">
                <div className="flex items-end justify-center gap-2">
                  <span className="shrink-0 leading-none">ลงชื่อ</span>
                  <span
                    data-testid="student-signature-line"
                    className="inline-block w-48 border-b border-dotted border-[#374151] h-4"
                  />
                </div>
                <p
                  data-testid="student-signature-name"
                  className="mt-2.5 text-center leading-relaxed"
                >
                  ( {effectiveFullName || '........................................'} )
                </p>
                <p className="mt-0.5 text-center font-medium text-[#4B5563]">ผู้สมัครทุนการศึกษา</p>
              </div>

              <div className="flex flex-col items-center">
                <div className="flex items-end justify-center gap-2">
                  <span className="shrink-0 leading-none">ลงชื่อ</span>
                  <span
                    data-testid="advisor-signature-line"
                    className="inline-block w-48 border-b border-dotted border-[#374151] h-4"
                  />
                </div>
                <p
                  data-testid="advisor-signature-name"
                  className="mt-2.5 text-center leading-relaxed"
                >
                  ( {advisorDisplayName || '........................................'} )
                </p>
                <p className="mt-0.5 text-center font-medium text-[#4B5563]">อาจารย์ผู้พิจารณา</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {directPrintData && (
        <DirectPrintModal
          blobUrl={directPrintData.blobUrl}
          filename={directPrintData.filename}
          pageCount={directPrintData.pageCount}
          orientation={directPrintData.orientation}
          pageImages={directPrintData.pageImages}
          onClose={() => setDirectPrintData(null)}
        />
      )}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}

