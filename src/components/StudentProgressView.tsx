import { CheckCircle2, Clock, MessageSquareText, Lock, Unlock } from 'lucide-react';
import type { BasicInfoData, GradeRecord, ScholarshipApplicationData, VolunteerRecord } from '../types/scholarship';
import {
  calculateApprovedVolunteerHours,
  getApplicationStatusMeta,
  isVolunteerModuleUnlocked,
} from '../utils/scholarshipLogic';

interface StudentProgressViewProps {
  basicInfo: BasicInfoData;
  application: ScholarshipApplicationData | null;
  grades: GradeRecord[];
  volunteers: VolunteerRecord[];
  onNavigate: (tab: 'basic' | 'application' | 'grades' | 'volunteer') => void;
}

export function StudentProgressView({
  basicInfo,
  application,
  grades,
  volunteers,
  onNavigate,
}: StudentProgressViewProps) {
  const statusMeta = getApplicationStatusMeta(application?.status);
  const unlocked = isVolunteerModuleUnlocked(application);
  const volSummary = calculateApprovedVolunteerHours(volunteers);

  const steps = [
    {
      num: 1,
      title: 'ยินยอม PDPA & บันทึกข้อมูลพื้นฐาน',
      done: basicInfo.pdpaConsented && !basicInfo.isDraft,
    },
    {
      num: 2,
      title: 'ยื่นใบสมัครทุนการศึกษา',
      done: Boolean(application && application.status !== 'draft'),
    },
    {
      num: 3,
      title: 'อาจารย์ตรวจสอบคุณสมบัติ',
      done: Boolean(
        application &&
          ['reviewing', 'approved', 'rejected'].includes(application.status)
      ),
    },
    {
      num: 4,
      title: 'ผลการพิจารณาทุน & เปิดระบบจิตอาสา',
      done: application?.status === 'approved',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#D8C6A6] bg-white p-6">
        <h2 className="font-display text-xl font-bold text-[#7A1629]">
          4. ความคืบหน้าการสมัครทุนการศึกษา
        </h2>
        <p className="text-sm text-[#66585B] mt-1">
          ติดตามสถานะการพิจารณาทุน ความคิดเห็นจากอาจารย์ที่ปรึกษา และสิทธิ์การเข้าใช้งานระบบจิตอาสา
        </p>
      </div>

      {/* Main Status Summary */}
      <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EAE0CE] pb-5">
          <div>
            <p className="text-xs font-medium text-[#66585B]">สถานะปัจจุบัน</p>
            <h3 className="font-display text-2xl font-bold text-[#7A1629] mt-0.5">
              {statusMeta.label}
            </h3>
            <p className="text-sm text-[#23181A] mt-1">{statusMeta.description}</p>
          </div>

          <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] px-4 py-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-[#23181A]">
              {unlocked ? (
                <>
                  <Unlock className="h-4 w-4 text-[#166534]" aria-hidden="true" />
                  <span className="text-[#166534]">ระบบจิตอาสา: เปิดใช้งานแล้ว</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-[#92400E]" aria-hidden="true" />
                  <span className="text-[#92400E]">ระบบจิตอาสา: ล็อก (รอการอนุมัติทุน)</span>
                </>
              )}
            </div>
            <p className="text-xs text-[#66585B] mt-1 tabular-nums">
              ชั่วโมงจิตอาสาที่อนุมัติแล้ว: {volSummary.approvedHours} ชั่วโมง
            </p>
          </div>
        </div>

        {/* 4-Step Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {steps.map((s) => (
            <div
              key={s.num}
              className={`rounded-xl border p-4 ${
                s.done
                  ? 'border-[#C6922C] bg-[#FDF8EC]'
                  : 'border-[#EAE0CE] bg-[#FAF6EE]/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold text-[#7A1629]">
                  ขั้นตอนที่ {s.num}
                </span>
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 text-[#166534]" aria-hidden="true" />
                ) : (
                  <Clock className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-[#23181A]">{s.title}</p>
            </div>
          ))}
        </div>

        {/* Advisor Comment */}
        <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] p-5 space-y-2">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-[#7A1629]">
            <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>ความคิดเห็นและข้อเสนอแนะจากอาจารย์</span>
          </div>
          {application?.advisorComment ? (
            <div className="space-y-1 text-sm text-[#23181A]">
              <p>{application.advisorComment}</p>
              <p className="text-xs text-[#66585B]">
                ผู้พิจารณา: {application.reviewedBy || 'อาจารย์ประจำสาขา'} ·{' '}
                {application.reviewedAt
                  ? new Date(application.reviewedAt).toLocaleDateString('th-TH')
                  : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[#66585B]">
              ยังไม่มีความคิดเห็นเพิ่มเติมจากอาจารย์ผู้พิจารณา
            </p>
          )}
        </div>

        {/* Action Links */}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate('basic')}
            className="rounded-lg border border-[#D8CBB8] bg-white px-4 py-2 text-xs font-medium text-[#23181A] hover:bg-[#FAF6EE]"
          >
            ตรวจสอบข้อมูลพื้นฐาน
          </button>
          <button
            type="button"
            onClick={() => onNavigate('application')}
            className="rounded-lg border border-[#D8CBB8] bg-white px-4 py-2 text-xs font-medium text-[#23181A] hover:bg-[#FAF6EE]"
          >
            ดู/แก้ไขใบสมัครทุน ({application?.status || 'ยังไม่สมัคร'})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('grades')}
            className="rounded-lg border border-[#D8CBB8] bg-white px-4 py-2 text-xs font-medium text-[#23181A] hover:bg-[#FAF6EE]"
          >
            บันทึกผลการเรียน ({grades.length} รายการ)
          </button>
          {unlocked && (
            <button
              type="button"
              onClick={() => onNavigate('volunteer')}
              className="rounded-lg bg-[#7A1629] px-4 py-2 text-xs font-medium text-white hover:bg-[#5B0F1D]"
            >
              ไปบันทึกกิจกรรมจิตอาสา
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
