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
      <div className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6">
        <h2 className="font-display text-xl font-bold text-[#7A1629] dark:text-[#F3B9C3]">
          4. ความคืบหน้าการสมัครทุนการศึกษา
        </h2>
        <p className="text-sm text-[#66585B] dark:text-[#A19B91] mt-1">
          ติดตามสถานะการพิจารณาทุน ความคิดเห็นจากอาจารย์ที่ปรึกษา และสิทธิ์การเข้าใช้งานระบบจิตอาสา
        </p>
      </div>

      {/* Main Status Summary */}
      <section className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EAE0CE] dark:border-[#343842] pb-5">
          <div>
            <p className="text-xs font-medium text-[#66585B] dark:text-[#A19B91]">สถานะปัจจุบัน</p>
            <h3 className="font-display text-2xl font-bold text-[#7A1629] dark:text-[#F3B9C3] mt-0.5">
              {statusMeta.label}
            </h3>
            <p className="text-sm text-[#23181A] dark:text-[#E6E2DC] mt-1">{statusMeta.description}</p>
          </div>

          <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1B1D23] px-4 py-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-[#23181A] dark:text-[#F2EFEA]">
              {unlocked ? (
                <>
                  <Unlock className="h-4 w-4 text-[#166534] dark:text-emerald-400" aria-hidden="true" />
                  <span className="text-[#166534] dark:text-emerald-400">ระบบจิตอาสา: เปิดใช้งานแล้ว</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-[#92400E] dark:text-amber-400" aria-hidden="true" />
                  <span className="text-[#92400E] dark:text-amber-400">ระบบจิตอาสา: ล็อก (รอการอนุมัติทุน)</span>
                </>
              )}
            </div>
            <p className="text-xs text-[#66585B] dark:text-[#A19B91] mt-1 tabular-nums">
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
                  ? 'border-[#C6922C] dark:border-[#E8C97A]/55 bg-[#FDF8EC] dark:bg-[#2B2518]'
                  : 'border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE]/60 dark:bg-[#1B1D23]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold text-[#7A1629] dark:text-[#F3B9C3]">
                  ขั้นตอนที่ {s.num}
                </span>
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 text-[#166534] dark:text-emerald-400" aria-hidden="true" />
                ) : (
                  <Clock className="h-4 w-4 text-[#9CA3AF] dark:text-[#6B7280]" aria-hidden="true" />
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-[#23181A] dark:text-[#F2EFEA]">{s.title}</p>
            </div>
          ))}
        </div>

        {/* Advisor Comment */}
        <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1B1D23] p-5 space-y-2">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-[#7A1629] dark:text-[#F3B9C3]">
            <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>ความคิดเห็นและข้อเสนอแนะจากอาจารย์</span>
          </div>
          {application?.advisorComment ? (
            <div className="space-y-1 text-sm text-[#23181A] dark:text-[#E6E2DC]">
              <p>{application.advisorComment}</p>
              <p className="text-xs text-[#66585B] dark:text-[#A19B91]">
                ผู้พิจารณา: {application.reviewedBy || 'อาจารย์ประจำสาขา'} ·{' '}
                {application.reviewedAt
                  ? new Date(application.reviewedAt).toLocaleDateString('th-TH')
                  : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[#66585B] dark:text-[#A19B91]">
              ยังไม่มีความคิดเห็นเพิ่มเติมจากอาจารย์ผู้พิจารณา
            </p>
          )}
        </div>

        {/* Action Links */}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate('basic')}
            className="rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1B1D23] px-4 py-2 text-xs font-medium text-[#23181A] dark:text-[#F2EFEA] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]"
          >
            ตรวจสอบข้อมูลพื้นฐาน
          </button>
          <button
            type="button"
            onClick={() => onNavigate('application')}
            className="rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1B1D23] px-4 py-2 text-xs font-medium text-[#23181A] dark:text-[#F2EFEA] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]"
          >
            ดู/แก้ไขใบสมัครทุน ({application?.status || 'ยังไม่สมัคร'})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('grades')}
            className="rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1B1D23] px-4 py-2 text-xs font-medium text-[#23181A] dark:text-[#F2EFEA] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]"
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
