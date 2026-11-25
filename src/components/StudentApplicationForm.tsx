import { useState } from 'react';
import { RefreshCw, Send, Save } from 'lucide-react';
import { api } from '../services/api';
import type {
  BasicInfoData,
  ScholarshipApplicationData,
  StructuredAddress,
} from '../types/scholarship';
import {
  ACADEMIC_YEARS,
  YEAR_LEVELS,
  getApplicationStatusMeta,
  prefillApplicationFromBasicInfo,
} from '../utils/scholarshipLogic';
import { FileUploadField } from './FileUploadField';

interface StudentApplicationFormProps {
  studentUserId: string;
  basicInfo: BasicInfoData;
  existingApplication: ScholarshipApplicationData | null;
  onSaved: (next: ScholarshipApplicationData) => void;
}

function AddressBlock({
  title,
  value,
  onChange,
}: {
  title: string;
  value: StructuredAddress;
  onChange: (next: StructuredAddress) => void;
}) {
  return (
    <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-4 space-y-3">
      <h4 className="font-display text-sm font-semibold text-[#7A1629]">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#23181A] mb-1">บ้านเลขที่ / หมู่ที่ **</label>
          <input
            type="text"
            value={value.houseNo}
            onChange={(e) => onChange({ ...value, houseNo: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#23181A] mb-1">ตรอก / ซอย / ถนน **</label>
          <input
            type="text"
            value={value.alleyRoad}
            onChange={(e) => onChange({ ...value, alleyRoad: e.target.value })}
            placeholder="- หากไม่มี"
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#23181A] mb-1">ตำบล / แขวง **</label>
          <input
            type="text"
            value={value.subDistrict}
            onChange={(e) => onChange({ ...value, subDistrict: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#23181A] mb-1">อำเภอ / เขต **</label>
          <input
            type="text"
            value={value.district}
            onChange={(e) => onChange({ ...value, district: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#23181A] mb-1">จังหวัด **</label>
          <input
            type="text"
            value={value.province}
            onChange={(e) => onChange({ ...value, province: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#23181A] mb-1">รหัสไปรษณีย์ **</label>
          <input
            type="text"
            value={value.postalCode}
            onChange={(e) => onChange({ ...value, postalCode: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}

export function StudentApplicationForm({
  studentUserId,
  basicInfo,
  existingApplication,
  onSaved,
}: StudentApplicationFormProps) {
  const [form, setForm] = useState<ScholarshipApplicationData>(() =>
    prefillApplicationFromBasicInfo(basicInfo, existingApplication, studentUserId)
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const statusMeta = getApplicationStatusMeta(form.status);

  const handleSyncFromBasicInfo = () => {
    setForm((prev) => prefillApplicationFromBasicInfo(basicInfo, prev, studentUserId));
    setFeedback({
      type: 'success',
      text: 'ดึงข้อมูลพื้นฐานล่าสุดเข้าสู่แบบฟอร์มสมัครทุนเรียบร้อยแล้ว',
    });
  };

  const handleSave = async (submitNow: boolean) => {
    setFeedback(null);
    if (submitNow) {
      if (
        !form.fullName.trim() ||
        !form.studentId.trim() ||
        !form.financialProblemDetail.trim() ||
        !form.scholarshipNecessityDetail.trim() ||
        !form.expectedBenefitDetail.trim()
      ) {
        setFeedback({
          type: 'error',
          text: 'กรุณากรอกข้อมูลสำคัญและคำอธิบายความจำเป็นในส่วนที่ 1–3 ให้ครบถ้วนก่อนยื่นทุนการศึกษา',
        });
        return;
      }
    }

    setSaving(true);
    try {
      const res = await api.saveApplication(form, submitNow);
      setForm(res.application);
      onSaved(res.application);
      setFeedback({
        type: 'success',
        text: submitNow
          ? 'บันทึกและยื่นสมัครทุนการศึกษาเรียบร้อยแล้ว ข้อมูลถูกส่งไปยังอาจารย์และผู้ดูแลระบบ'
          : 'บันทึกฉบับร่างใบสมัครทุนการศึกษาเรียบร้อยแล้ว',
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
            2. บันทึกข้อมูลสมัครทุนการศึกษา
          </h2>
          <p className="text-sm text-[#66585B]">
            สถานะปัจจุบัน: <strong className="text-[#7A1629]">{statusMeta.label}</strong> ·
            จำเป็นทุกช่อง กรณีที่ไม่มีข้อมูลให้ขีด -
          </p>
        </div>

        <button
          type="button"
          onClick={handleSyncFromBasicInfo}
          className="inline-flex items-center gap-2 rounded-lg border border-[#C6922C] bg-[#FDF8EC] px-4 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#F7EBCB]"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>ดึงข้อมูลจากข้อมูลพื้นฐาน</span>
        </button>
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

      {/* Part 1 */}
      <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5">
        <h3 className="font-display text-base font-bold text-[#7A1629] border-b border-[#EAE0CE] pb-3">
          ส่วนที่ 1 ข้อมูลส่วนตัวของผู้สมัคร
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">ปีการศึกษาที่ขอรับทุน</label>
            <select
              value={form.academicYear}
              onChange={(e) =>
                setForm({ ...form, academicYear: e.target.value as ScholarshipApplicationData['academicYear'] })
              }
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            >
              {ACADEMIC_YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">ชั้นปี</label>
            <select
              value={form.yearLevel}
              onChange={(e) =>
                setForm({ ...form, yearLevel: e.target.value as ScholarshipApplicationData['yearLevel'] })
              }
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            >
              {YEAR_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">รหัสประจำตัวนักศึกษา **</label>
            <input
              type="text"
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#23181A] mb-1">ชื่อ – นามสกุล **</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">ชั้นปี / หมู่เรียน **</label>
            <input
              type="text"
              value={form.yearAndSection}
              onChange={(e) => setForm({ ...form, yearAndSection: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">ผลการเรียนเฉลี่ยสะสม (GPAX) **</label>
            <input
              type="text"
              value={form.gpax}
              onChange={(e) => setForm({ ...form, gpax: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">วัน / เดือน / ปีเกิด **</label>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">อายุ **</label>
            <input
              type="text"
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">สัญชาติ **</label>
            <input
              type="text"
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">เชื้อชาติ **</label>
            <input
              type="text"
              value={form.ethnicity}
              onChange={(e) => setForm({ ...form, ethnicity: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">ศาสนา **</label>
            <input
              type="text"
              value={form.religion}
              onChange={(e) => setForm({ ...form, religion: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">เบอร์โทรศัพท์ติดต่อ **</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#23181A] mb-1">Facebook **</label>
            <input
              type="text"
              value={form.facebook}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <AddressBlock
          title="1.3 ที่อยู่ตามทะเบียนบ้าน"
          value={form.registeredAddress}
          onChange={(registeredAddress) => setForm({ ...form, registeredAddress })}
        />

        <AddressBlock
          title="1.4 ที่อยู่ปัจจุบัน"
          value={form.currentAddress}
          onChange={(currentAddress) => setForm({ ...form, currentAddress })}
        />

        {/* 1.5 Financial & 1.6 Health & 1.7 Income */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[#EAE0CE]">
          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">
              1.5 ข้าพเจ้าได้รับการอุปการะด้านการเงินจาก **
            </label>
            <input
              type="text"
              value={form.financialSponsorName}
              onChange={(e) => setForm({ ...form, financialSponsorName: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">มีความสัมพันธ์โดยเป็น</label>
            <select
              value={form.financialSponsorRelation}
              onChange={(e) =>
                setForm({
                  ...form,
                  financialSponsorRelation: e.target.value as ScholarshipApplicationData['financialSponsorRelation'],
                })
              }
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            >
              <option value="บิดา">บิดา</option>
              <option value="มารดา">มารดา</option>
              <option value="ปู่ ย่า ตา ยาย">ปู่ ย่า ตา ยาย</option>
              <option value="อื่นๆ">อื่น ๆ (โปรดระบุ)</option>
            </select>
            {form.financialSponsorRelation === 'อื่นๆ' && (
              <input
                type="text"
                value={form.financialSponsorRelationOther}
                onChange={(e) => setForm({ ...form, financialSponsorRelationOther: e.target.value })}
                placeholder="โปรดระบุความสัมพันธ์"
                className="mt-2 w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">ค่าใช้จ่ายที่ได้รับต่อเดือน (บาท)</label>
            <input
              type="text"
              value={form.monthlyExpenses}
              onChange={(e) => setForm({ ...form, monthlyExpenses: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#EAE0CE]">
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#23181A]">1.6 โรคประจำตัว</span>
            <div className="flex gap-4 text-sm">
              {(['ไม่มี', 'มี'] as const).map((opt) => (
                <label key={opt} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={form.hasChronicDisease === opt}
                    onChange={() => setForm({ ...form, hasChronicDisease: opt })}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {form.hasChronicDisease === 'มี' && (
              <input
                type="text"
                value={form.chronicDiseaseDetail}
                onChange={(e) => setForm({ ...form, chronicDiseaseDetail: e.target.value })}
                placeholder="โปรดระบุโรคประจำตัว"
                className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#23181A]">1.7 การกู้ยืมเงิน กยศ.</span>
            <div className="flex gap-4 text-sm">
              {(['กู้ กยศ.', 'ไม่กู้ กยศ.'] as const).map((opt) => (
                <label key={opt} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={form.hasStudentLoan === opt}
                    onChange={() => setForm({ ...form, hasStudentLoan: opt })}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#23181A]">การได้รับทุนการศึกษาอื่น</span>
            <div className="flex gap-4 text-sm">
              {(['ไม่ได้รับ', 'ได้รับ'] as const).map((opt) => (
                <label key={opt} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={form.hasOtherScholarship === opt}
                    onChange={() => setForm({ ...form, hasOtherScholarship: opt })}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {form.hasOtherScholarship === 'ได้รับ' && (
              <input
                type="text"
                value={form.otherScholarshipNameAmount}
                onChange={(e) => setForm({ ...form, otherScholarshipNameAmount: e.target.value })}
                placeholder="ระบุชื่อทุนและจำนวนเงิน"
                className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#23181A]">การทำงานหารายได้เสริม</span>
            <div className="flex gap-4 text-sm">
              {(['ไม่ได้ทำงาน', 'ทำงาน'] as const).map((opt) => (
                <label key={opt} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={form.hasPartTimeJob === opt}
                    onChange={() => setForm({ ...form, hasPartTimeJob: opt })}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {form.hasPartTimeJob === 'ทำงาน' && (
              <input
                type="text"
                value={form.partTimeJobDetailIncome}
                onChange={(e) => setForm({ ...form, partTimeJobDetailIncome: e.target.value })}
                placeholder="ระบุลักษณะงานและรายได้ที่ได้รับ"
                className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
              />
            )}
          </div>
        </div>
      </section>

      {/* Part 2: Family */}
      <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5">
        <h3 className="font-display text-base font-bold text-[#7A1629] border-b border-[#EAE0CE] pb-3">
          ส่วนที่ 2 ข้อมูลครอบครัวและผู้ปกครอง
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-4 space-y-2.5">
            <h4 className="font-display text-sm font-semibold text-[#7A1629]">2.1 ข้อมูลบิดา</h4>
            <input
              type="text"
              placeholder="ชื่อ – นามสกุล"
              value={form.father.fullName}
              onChange={(e) => setForm({ ...form, father: { ...form.father, fullName: e.target.value } })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.father.status}
                onChange={(e) => setForm({ ...form, father: { ...form.father, status: e.target.value as 'ยังมีชีวิตอยู่' | 'ถึงแก่กรรม' | '' } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
              >
                <option value="">สถานภาพ</option>
                <option value="ยังมีชีวิตอยู่">ยังมีชีวิตอยู่</option>
                <option value="ถึงแก่กรรม">ถึงแก่กรรม</option>
              </select>
              <input
                type="text"
                placeholder="อายุ"
                value={form.father.age}
                onChange={(e) => setForm({ ...form, father: { ...form.father, age: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
              />
              <input
                type="text"
                placeholder="อาชีพ"
                value={form.father.occupation}
                onChange={(e) => setForm({ ...form, father: { ...form.father, occupation: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="สถานที่ทำงาน"
                value={form.father.workplace}
                onChange={(e) => setForm({ ...form, father: { ...form.father, workplace: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="รายได้ต่อเดือน"
                value={form.father.monthlyIncome}
                onChange={(e) => setForm({ ...form, father: { ...form.father, monthlyIncome: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
              />
              <input
                type="text"
                placeholder="เบอร์โทรศัพท์"
                value={form.father.phone}
                onChange={(e) => setForm({ ...form, father: { ...form.father, phone: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-4 space-y-2.5">
            <h4 className="font-display text-sm font-semibold text-[#7A1629]">2.2 ข้อมูลมารดา</h4>
            <input
              type="text"
              placeholder="ชื่อ – นามสกุล"
              value={form.mother.fullName}
              onChange={(e) => setForm({ ...form, mother: { ...form.mother, fullName: e.target.value } })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.mother.status}
                onChange={(e) => setForm({ ...form, mother: { ...form.mother, status: e.target.value as 'ยังมีชีวิตอยู่' | 'ถึงแก่กรรม' | '' } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
              >
                <option value="">สถานภาพ</option>
                <option value="ยังมีชีวิตอยู่">ยังมีชีวิตอยู่</option>
                <option value="ถึงแก่กรรม">ถึงแก่กรรม</option>
              </select>
              <input
                type="text"
                placeholder="อายุ"
                value={form.mother.age}
                onChange={(e) => setForm({ ...form, mother: { ...form.mother, age: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
              />
              <input
                type="text"
                placeholder="อาชีพ"
                value={form.mother.occupation}
                onChange={(e) => setForm({ ...form, mother: { ...form.mother, occupation: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="สถานที่ทำงาน"
                value={form.mother.workplace}
                onChange={(e) => setForm({ ...form, mother: { ...form.mother, workplace: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="รายได้ต่อเดือน"
                value={form.mother.monthlyIncome}
                onChange={(e) => setForm({ ...form, mother: { ...form.mother, monthlyIncome: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
              />
              <input
                type="text"
                placeholder="เบอร์โทรศัพท์"
                value={form.mother.phone}
                onChange={(e) => setForm({ ...form, mother: { ...form.mother, phone: e.target.value } })}
                className="rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">2.3 สถานภาพสมรสของบิดาและมารดา</label>
            <select
              value={form.parentsMaritalStatus}
              onChange={(e) =>
                setForm({
                  ...form,
                  parentsMaritalStatus: e.target.value as ScholarshipApplicationData['parentsMaritalStatus'],
                })
              }
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            >
              <option value="อยู่ด้วยกัน">อยู่ด้วยกัน</option>
              <option value="แยกกันอยู่ตามอาชีพ">แยกกันอยู่ตามอาชีพ</option>
              <option value="หย่า">หย่า</option>
              <option value="อื่นๆ">อื่น ๆ (โปรดระบุ)</option>
            </select>
            {form.parentsMaritalStatus === 'อื่นๆ' && (
              <input
                type="text"
                value={form.parentsMaritalStatusOther}
                onChange={(e) => setForm({ ...form, parentsMaritalStatusOther: e.target.value })}
                placeholder="โปรดระบุ"
                className="mt-2 w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">จำนวนสมาชิกในครัวเรือน (ไม่รวมผู้สมัคร)</label>
            <input
              type="text"
              value={form.householdMembersCount}
              onChange={(e) => setForm({ ...form, householdMembersCount: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#23181A] mb-1">สถานะการอยู่อาศัย</label>
            <select
              value={form.housingStatus}
              onChange={(e) =>
                setForm({
                  ...form,
                  housingStatus: e.target.value as ScholarshipApplicationData['housingStatus'],
                })
              }
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            >
              <option value="บ้านของตนเอง">บ้านของตนเอง</option>
              <option value="บ้านเช่า">บ้านเช่า</option>
              <option value="อื่นๆ">อื่น ๆ (โปรดระบุ)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-[#23181A] mb-1">
              ปัจจุบันนักศึกษาพักอาศัยอยู่กับใคร
            </label>
            <input
              type="text"
              value={form.currentlyLivingWith}
              onChange={(e) => setForm({ ...form, currentlyLivingWith: e.target.value })}
              className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Part 3: Problems & Necessity */}
      <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-[#7A1629] border-b border-[#EAE0CE] pb-3">
          ส่วนที่ 3 ข้อมูลปัญหาและความจำเป็นในการขอรับทุนการศึกษา
        </h3>
        <div>
          <label className="block text-xs font-semibold text-[#23181A] mb-1">
            3.1 สภาพปัญหาและความจำเป็นทางการเงิน *
          </label>
          <p className="text-xs text-[#66585B] mb-1.5">
            อธิบายสภาพความเป็นอยู่ของครอบครัว ภาระค่าใช้จ่าย รายได้ของผู้ปกครอง ภาระหนี้สิน (ถ้ามี) และปัญหาที่ส่งผลต่อการศึกษา
          </p>
          <textarea
            rows={3}
            value={form.financialProblemDetail}
            onChange={(e) => setForm({ ...form, financialProblemDetail: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#23181A] mb-1">
            3.2 เหตุผลและความจำเป็นในการขอรับทุนการศึกษา *
          </label>
          <textarea
            rows={3}
            value={form.scholarshipNecessityDetail}
            onChange={(e) => setForm({ ...form, scholarshipNecessityDetail: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#23181A] mb-1">
            3.3 ประโยชน์ที่คาดว่าจะได้รับจากทุนการศึกษา *
          </label>
          <textarea
            rows={3}
            value={form.expectedBenefitDetail}
            onChange={(e) => setForm({ ...form, expectedBenefitDetail: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
          />
        </div>
      </section>

      {/* Part 4: House Photos */}
      <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5">
        <div className="border-b border-[#EAE0CE] pb-3">
          <h3 className="font-display text-base font-bold text-[#7A1629]">
            ส่วนที่ 4 ภาพถ่ายประกอบการสมัครขอรับทุนการศึกษา
          </h3>
          <p className="text-xs text-[#66585B] mt-1">
            ขนาดไฟล์ไม่เกิน 5 MB ต่อไฟล์ รองรับ PDF, JPG, PNG และ WEBP หากยังไม่มีเอกสาร
            สามารถบันทึกข้อมูลไว้ก่อนและแนบเอกสารภายหลังได้
          </p>
        </div>

        <FileUploadField
          label="4.1 ภาพถ่ายภายในบ้านที่พักอาศัย (ขั้นต่ำ 1 รูป)"
          helperText="แสดงสภาพภายในบริเวณบ้านที่พักอาศัย"
          files={form.indoorHousePhotos}
          onChange={(indoorHousePhotos) => setForm({ ...form, indoorHousePhotos })}
          maxSizeMB={5}
          allowPdf={true}
          minCount={1}
        />

        <FileUploadField
          label="4.1 ภาพถ่ายผู้สมัครร่วมกับสมาชิกในครอบครัว (ภายในบ้าน ขั้นต่ำ 1 รูป)"
          helperText="ภาพผู้สมัครถ่ายร่วมกับสมาชิกในครอบครัวภายในบ้าน"
          files={form.indoorFamilyPhotos}
          onChange={(indoorFamilyPhotos) => setForm({ ...form, indoorFamilyPhotos })}
          maxSizeMB={5}
          allowPdf={true}
          minCount={1}
        />

        <FileUploadField
          label="4.2 ภาพถ่ายบริเวณด้านหน้าที่พักอาศัย (ภายนอกบ้าน ขั้นต่ำ 1 รูป)"
          helperText="แสดงบริเวณด้านหน้าและสภาพแวดล้อมภายนอกบ้าน"
          files={form.outdoorHousePhotos}
          onChange={(outdoorHousePhotos) => setForm({ ...form, outdoorHousePhotos })}
          maxSizeMB={5}
          allowPdf={true}
          minCount={1}
        />

        <FileUploadField
          label="4.2 ภาพถ่ายผู้สมัครร่วมกับสมาชิกในครอบครัว (ภายนอกบ้าน ขั้นต่ำ 1 รูป)"
          helperText="ภาพผู้สมัครถ่ายร่วมกับสมาชิกในครอบครัวบริเวณหน้าบ้าน"
          files={form.outdoorFamilyPhotos}
          onChange={(outdoorFamilyPhotos) => setForm({ ...form, outdoorFamilyPhotos })}
          maxSizeMB={5}
          allowPdf={true}
          minCount={1}
        />
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSave(false)}
          className="inline-flex items-center gap-2 rounded-lg border border-[#D8CBB8] bg-white px-5 py-2.5 text-sm font-medium text-[#23181A] hover:bg-[#FAF6EE]"
        >
          <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>บันทึกฉบับร่าง</span>
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => handleSave(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#7A1629] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D]"
        >
          <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{saving ? 'กำลังส่งข้อมูล...' : 'ยื่นทุนการศึกษา'}</span>
        </button>
      </div>
    </div>
  );
}
