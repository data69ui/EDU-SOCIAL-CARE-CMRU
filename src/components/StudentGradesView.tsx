import { useState } from 'react';
import { BookOpenCheck, FileText } from 'lucide-react';
import { api } from '../services/api';
import type {
  AcademicYear,
  GradeRecord,
  SemesterType,
  UploadedFileMeta,
  YearLevel,
} from '../types/scholarship';
import { ACADEMIC_YEARS, YEAR_LEVELS } from '../utils/scholarshipLogic';
import { FileUploadField } from './FileUploadField';

interface StudentGradesViewProps {
  grades: GradeRecord[];
  defaultAcademicYear: AcademicYear;
  defaultYearLevel: YearLevel;
  onGradeSaved: (grade: GradeRecord) => void;
}

export function StudentGradesView({
  grades,
  defaultAcademicYear,
  defaultYearLevel,
  onGradeSaved,
}: StudentGradesViewProps) {
  const [academicYear, setAcademicYear] = useState<AcademicYear>(defaultAcademicYear || '2569');
  const [yearLevel, setYearLevel] = useState<YearLevel>(defaultYearLevel || 'ปี 1');
  const [semester, setSemester] = useState<SemesterType>('ภาคเรียนที่ 1');
  const [gpa, setGpa] = useState('');
  const [attachments, setAttachments] = useState<UploadedFileMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!gpa.trim()) {
      setFeedback({ type: 'error', text: 'กรุณากรอกเกรดเฉลี่ยประจำภาคเรียน' });
      return;
    }

    if (attachments.length < 2) {
      setFeedback({
        type: 'error',
        text: 'กรุณาแนบหลักฐานแสดงผลการเรียนอย่างน้อย 2 รูปภาพ/ไฟล์ (ขนาดไม่เกิน 3 MB ต่อไฟล์)',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await api.saveGradeRecord({
        academicYear,
        yearLevel,
        semester,
        gpa: gpa.trim(),
        attachments,
      });
      onGradeSaved(res.grade);
      setGpa('');
      setAttachments([]);
      setFeedback({
        type: 'success',
        text: `บันทึกผลการเรียน ${semester} ปีการศึกษา ${academicYear} เรียบร้อยแล้ว ข้อมูลถูกจัดเก็บแยกภาคเรียนให้อาจารย์และผู้ดูแลระบบตรวจสอบ`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#D8C6A6] bg-white p-6">
        <h2 className="font-display text-xl font-bold text-[#7A1629]">
          3. บันทึกใบแสดงผลการเรียน (ภาคเรียนที่ 1 และ ภาคเรียนที่ 2)
        </h2>
        <p className="text-sm text-[#66585B] mt-1">
          ระบบจัดเก็บผลการเรียนทั้ง 2 ภาคเรียนแยกกัน โดยข้อมูลภาคเรียนที่ 1 จะยังคงอยู่ในระบบของอาจารย์เสมอ
          เมื่อบันทึกภาคเรียนที่ 2
        </p>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'error'
              ? 'border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]'
              : 'border-[#86EFAC] bg-[#F0FDF4] text-[#166534]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="grd-year" className="block text-xs font-medium text-[#23181A] mb-1">
              เลือกปีการศึกษา *
            </label>
            <select
              id="grd-year"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value as AcademicYear)}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            >
              {ACADEMIC_YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="grd-level" className="block text-xs font-medium text-[#23181A] mb-1">
              เลือกชั้นปี *
            </label>
            <select
              id="grd-level"
              value={yearLevel}
              onChange={(e) => setYearLevel(e.target.value as YearLevel)}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            >
              {YEAR_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="grd-sem" className="block text-xs font-medium text-[#23181A] mb-1">
              ภาคเรียน *
            </label>
            <select
              id="grd-sem"
              value={semester}
              onChange={(e) => setSemester(e.target.value as SemesterType)}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            >
              <option value="ภาคเรียนที่ 1">ภาคเรียนที่ 1</option>
              <option value="ภาคเรียนที่ 2">ภาคเรียนที่ 2</option>
            </select>
          </div>

          <div>
            <label htmlFor="grd-gpa" className="block text-xs font-medium text-[#23181A] mb-1">
              เกรดเฉลี่ยประจำภาคเรียน *
            </label>
            <input
              id="grd-gpa"
              type="text"
              value={gpa}
              onChange={(e) => setGpa(e.target.value)}
              placeholder="เช่น 3.65"
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
            />
          </div>
        </div>

        <FileUploadField
          label="แนบหลักฐานใบแสดงผลการเรียน (ขั้นต่ำ 2 รูป)"
          helperText="ขนาดไฟล์ไม่เกิน 3 MB ต่อไฟล์ รองรับ PDF, JPG, PNG และ WEBP"
          files={attachments}
          onChange={setAttachments}
          maxSizeMB={3}
          allowPdf={true}
          minCount={2}
        />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#7A1629] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D]"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกใบแสดงผลการเรียน'}
          </button>
        </div>
      </form>

      {/* Preserved Term 1 & Term 2 Records */}
      <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EAE0CE] pb-3">
          <BookOpenCheck className="h-5 w-5 text-[#7A1629]" aria-hidden="true" />
          <h3 className="font-display text-base font-bold text-[#23181A]">
            ประวัติผลการเรียนที่บันทึกไว้ ({grades.length} รายการ)
          </h3>
        </div>

        {grades.length === 0 ? (
          <p className="text-sm text-[#66585B] py-4">
            ยังไม่มีประวัติการส่งใบแสดงผลการเรียน กรุณาบันทึกข้อมูลด้านบน
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#EAE0CE] text-xs text-[#66585B]">
                  <th className="py-2.5 pr-4 font-semibold">ปีการศึกษา</th>
                  <th className="py-2.5 pr-4 font-semibold">ชั้นปี</th>
                  <th className="py-2.5 pr-4 font-semibold">ภาคเรียน</th>
                  <th className="py-2.5 pr-4 font-semibold">GPA</th>
                  <th className="py-2.5 pr-4 font-semibold">หลักฐาน</th>
                  <th className="py-2.5 font-semibold">ผู้บันทึก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E8D8]">
                {grades.map((g) => (
                  <tr key={g.id}>
                    <td className="py-3 pr-4 tabular-nums font-medium">{g.academicYear}</td>
                    <td className="py-3 pr-4">{g.yearLevel}</td>
                    <td className="py-3 pr-4">{g.semester}</td>
                    <td className="py-3 pr-4 font-semibold text-[#7A1629] tabular-nums">{g.gpa}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {g.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#7A1629] hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="max-w-[140px] truncate">{att.name}</span>
                          </a>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 text-xs text-[#66585B]">{g.uploadedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
