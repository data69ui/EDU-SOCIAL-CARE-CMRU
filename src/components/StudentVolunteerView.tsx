import { useState } from 'react';
import { Lock, HeartHandshake, CheckCircle2, Clock } from 'lucide-react';
import { api } from '../services/api';
import type {
  AcademicYear,
  ScholarshipApplicationData,
  UploadedFileMeta,
  VolunteerRecord,
} from '../types/scholarship';
import {
  ACADEMIC_YEARS,
  calculateApprovedVolunteerHours,
  isVolunteerModuleUnlocked,
} from '../utils/scholarshipLogic';
import { FileUploadField } from './FileUploadField';

interface StudentVolunteerViewProps {
  application: ScholarshipApplicationData | null;
  volunteers: VolunteerRecord[];
  defaultAcademicYear: AcademicYear;
  onVolunteerAdded: (record: VolunteerRecord) => void;
  onGoToProgress: () => void;
}

export function StudentVolunteerView({
  application,
  volunteers,
  defaultAcademicYear,
  onVolunteerAdded,
  onGoToProgress,
}: StudentVolunteerViewProps) {
  const unlocked = isVolunteerModuleUnlocked(application);
  const summary = calculateApprovedVolunteerHours(volunteers);

  const [academicYear, setAcademicYear] = useState<AcademicYear>(defaultAcademicYear || '2569');
  const [activityTitle, setActivityTitle] = useState('');
  const [activityDetail, setActivityDetail] = useState('');
  const [learnings, setLearnings] = useState('');
  const [hours, setHours] = useState('4');
  const [activityDate, setActivityDate] = useState('');
  const [dailyLifeApplication, setDailyLifeApplication] = useState('');
  const [photos, setPhotos] = useState<UploadedFileMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  if (!unlocked) {
    return (
      <section className="rounded-2xl border border-[#D8C6A6] bg-white p-8 lg:p-12 text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7A1629]/10 text-[#7A1629]">
          <Lock className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-bold text-[#7A1629]">
          5. ระบบจิตอาสาหลังได้รับทุนการศึกษา (ล็อกอยู่)
        </h2>
        <p className="mx-auto max-w-xl text-sm text-[#66585B] leading-relaxed">
          ระบบบันทึกกิจกรรมจิตอาสาจะเปิดให้ใช้งานอัตโนมัติก็ต่อเมื่อใบสมัครทุนการศึกษาของท่านได้รับการอนุมัติเรียบร้อยแล้ว
          กรุณาตรวจสอบสถานะการสมัครทุนที่เมนู &ldquo;ความคืบหน้าการสมัครทุน&rdquo;
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onGoToProgress}
            className="rounded-lg bg-[#7A1629] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D]"
          >
            ดูความคืบหน้าการสมัครทุน
          </button>
        </div>
      </section>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (photos.length < 3) {
      setFeedback({
        type: 'error',
        text: 'กรุณาแนบรูปภาพยืนยันการทำจิตอาสาอย่างน้อย 3 รูป (ขนาดไม่เกิน 10 MB ต่อไฟล์)',
      });
      return;
    }

    if (
      !activityDetail.trim() ||
      !learnings.trim() ||
      !activityDate ||
      !dailyLifeApplication.trim() ||
      Number(hours) <= 0
    ) {
      setFeedback({
        type: 'error',
        text: 'กรุณากรอกรายละเอียดกิจกรรม สิ่งที่ได้รับ จำนวนชั่วโมง วันที่ และแนวทางการประยุกต์ใช้ให้ครบถ้วน',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await api.submitVolunteer({
        academicYear,
        activityTitle: activityTitle.trim() || activityDetail.slice(0, 48),
        activityDetail: activityDetail.trim(),
        learnings: learnings.trim(),
        hours: Number(hours),
        activityDate,
        dailyLifeApplication: dailyLifeApplication.trim(),
        photos,
      });
      onVolunteerAdded(res.volunteer);
      setActivityTitle('');
      setActivityDetail('');
      setLearnings('');
      setHours('4');
      setActivityDate('');
      setDailyLifeApplication('');
      setPhotos([]);
      setFeedback({
        type: 'success',
        text: 'บันทึกกิจกรรมจิตอาสาเรียบร้อยแล้ว รออาจารย์ตรวจสอบและอนุมัติชั่วโมงจิตอาสา',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#D8C6A6] bg-white p-6">
        <div>
          <h2 className="font-display text-xl font-bold text-[#7A1629]">
            5. ระบบบันทึกกิจกรรมจิตอาสาหลังได้รับทุนการศึกษา
          </h2>
          <p className="text-sm text-[#66585B] mt-1">
            แนบรูปภาพขั้นต่ำ 3 รูป (ขนาดไม่เกิน 10 MB) พร้อมบันทึกสิ่งที่ได้เรียนรู้และชั่วโมงจิตอาสา
          </p>
        </div>

        <div className="flex gap-6 rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] px-5 py-3 text-sm tabular-nums">
          <div>
            <p className="text-xs text-[#66585B]">อนุมัติแล้ว</p>
            <p className="font-display text-lg font-bold text-[#166534]">
              {summary.approvedHours} ชม.
            </p>
          </div>
          <div>
            <p className="text-xs text-[#66585B]">รอพิจารณา</p>
            <p className="font-display text-lg font-bold text-[#92400E]">
              {summary.pendingHours} ชม.
            </p>
          </div>
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="vol-title" className="block text-xs font-medium text-[#23181A] mb-1">
              ชื่อกิจกรรมจิตอาสา *
            </label>
            <input
              id="vol-title"
              type="text"
              value={activityTitle}
              onChange={(e) => setActivityTitle(e.target.value)}
              placeholder="เช่น ค่ายอาสาพัฒนาการอ่านวิชาสังคมศึกษา"
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="vol-year" className="block text-xs font-medium text-[#23181A] mb-1">
              ปีการศึกษา
            </label>
            <select
              id="vol-year"
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
            <label htmlFor="vol-hours" className="block text-xs font-medium text-[#23181A] mb-1">
              ทั้งหมดกี่ชั่วโมง *
            </label>
            <input
              id="vol-hours"
              type="number"
              min="1"
              max="200"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="vol-date" className="block text-xs font-medium text-[#23181A] mb-1">
              วันที่ทำจิตอาสา *
            </label>
            <input
              id="vol-date"
              type="date"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="vol-detail" className="block text-xs font-medium text-[#23181A] mb-1">
            2. รายละเอียดที่ทำจิตอาสา *
          </label>
          <textarea
            id="vol-detail"
            rows={3}
            value={activityDetail}
            onChange={(e) => setActivityDetail(e.target.value)}
            className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="vol-learn" className="block text-xs font-medium text-[#23181A] mb-1">
            3. สิ่งที่ได้จากการทำจิตอาสา *
          </label>
          <textarea
            id="vol-learn"
            rows={2}
            value={learnings}
            onChange={(e) => setLearnings(e.target.value)}
            className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="vol-apply" className="block text-xs font-medium text-[#23181A] mb-1">
            5. สามารถนำไปประยุกต์ใช้ในชีวิตประจำวันได้อย่างไร *
          </label>
          <textarea
            id="vol-apply"
            rows={2}
            value={dailyLifeApplication}
            onChange={(e) => setDailyLifeApplication(e.target.value)}
            className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
          />
        </div>

        <FileUploadField
          label="1. รูปภาพยืนยันการทำจิตอาสา (ขั้นต่ำ 3 รูป)"
          helperText="ขนาดไฟล์ไม่เกิน 10 MB ต่อไฟล์ รองรับ PDF, JPG, PNG และ WEBP"
          files={photos}
          onChange={setPhotos}
          maxSizeMB={10}
          allowPdf={true}
          minCount={3}
        />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#7A1629] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D]"
          >
            {saving ? 'กำลังส่งข้อมูล...' : 'ส่งบันทึกกิจกรรมจิตอาสา'}
          </button>
        </div>
      </form>

      {/* Submitted Volunteer History */}
      <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EAE0CE] pb-3">
          <HeartHandshake className="h-5 w-5 text-[#7A1629]" aria-hidden="true" />
          <h3 className="font-display text-base font-bold text-[#23181A]">
            ประวัติกิจกรรมจิตอาสา ({volunteers.length} กิจกรรม)
          </h3>
        </div>

        {volunteers.length === 0 ? (
          <p className="text-sm text-[#66585B] py-4">ยังไม่มีบันทึกกิจกรรมจิตอาสา</p>
        ) : (
          <div className="space-y-4">
            {volunteers.map((vol) => (
              <article
                key={vol.id}
                className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-display font-semibold text-[#7A1629]">{vol.activityTitle}</h4>
                  <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                    {vol.approvalStatus === 'approved' ? (
                      <span className="inline-flex items-center gap-1 text-[#166534]">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        อนุมัติแล้ว ({vol.approvedHours} ชั่วโมง)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#92400E]">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        รออาจารย์อนุมัติ ({vol.hours} ชั่วโมง)
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#66585B] tabular-nums">
                  วันที่ทำกิจกรรม: {vol.activityDate} · ปีการศึกษา {vol.academicYear}
                </p>
                <p className="text-sm text-[#23181A]">{vol.activityDetail}</p>
                {vol.advisorNote && (
                  <p className="text-xs text-[#7A1629] font-medium">
                    ความเห็นอาจารย์: {vol.advisorNote}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
