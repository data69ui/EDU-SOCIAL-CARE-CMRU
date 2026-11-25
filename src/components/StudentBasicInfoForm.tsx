import { useState } from 'react';
import { Edit3, Award, CheckCircle2, X, Trash2, AlertTriangle, Plus } from 'lucide-react';
import { api } from '../services/api';
import type { BasicInfoData, ParentInfo, ReceivedScholarshipItem } from '../types/scholarship';
import {
  ACADEMIC_YEARS,
  YEAR_LEVELS,
  formatReceivedScholarshipsText,
  sanitizeReceivedScholarships,
} from '../utils/scholarshipLogic';
import { FileUploadField } from './FileUploadField';
import { PdpaConsentModal } from './PdpaConsentModal';

interface StudentBasicInfoFormProps {
  basicInfo: BasicInfoData;
  onUpdated: (next: BasicInfoData) => void;
  onGoToApplication: () => void;
  onDeleteAccount?: () => Promise<void>;
}

function ParentFieldsGroup({
  title,
  value,
  onChange,
  required = true,
  showRelationship = false,
  relationshipValue = '',
  onRelationshipChange,
}: {
  title: string;
  value: ParentInfo;
  onChange: (next: ParentInfo) => void;
  required?: boolean;
  showRelationship?: boolean;
  relationshipValue?: string;
  onRelationshipChange?: (val: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-5 space-y-4">
      <h4 className="font-display text-sm font-semibold text-[#7A1629]">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-1">
          <label className="block text-xs font-medium text-[#23181A]">
            ชื่อ-นามสกุล {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.fullName}
            onChange={(e) => onChange({ ...value, fullName: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A]">
            สถานภาพ {required ? '*' : ''}
          </label>
          <select
            value={value.status}
            onChange={(e) =>
              onChange({
                ...value,
                status: e.target.value as ParentInfo['status'],
              })
            }
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          >
            <option value="">-- เลือก --</option>
            <option value="ยังมีชีวิตอยู่">ยังมีชีวิตอยู่</option>
            <option value="ถึงแก่กรรม">ถึงแก่กรรม</option>
          </select>
        </div>

        {showRelationship && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#23181A]">
              ความสัมพันธ์กับผู้ปกครอง
            </label>
            <input
              type="text"
              value={relationshipValue}
              onChange={(e) => onRelationshipChange?.(e.target.value)}
              placeholder="เช่น ป้า, ลุง, ยาย"
              className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A]">
            อายุ {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.age}
            onChange={(e) => onChange({ ...value, age: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A]">
            อาชีพ {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.occupation}
            onChange={(e) => onChange({ ...value, occupation: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A]">
            สถานที่ทำงาน {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.workplace}
            onChange={(e) => onChange({ ...value, workplace: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A]">
            รายได้ต่อเดือน (บาท) {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.monthlyIncome}
            onChange={(e) => onChange({ ...value, monthlyIncome: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A]">
            เบอร์โทรศัพท์ {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}

export function StudentBasicInfoForm({
  basicInfo,
  onUpdated,
  onGoToApplication,
  onDeleteAccount,
}: StudentBasicInfoFormProps) {
  const [form, setForm] = useState<BasicInfoData>(() => ({
    ...basicInfo,
    receivedScholarships:
      basicInfo.hasOtherScholarship === 'ได้รับทุน'
        ? sanitizeReceivedScholarships(basicInfo.receivedScholarships, basicInfo.otherScholarshipDetail)
        : [],
  }));
  const [isEditing, setIsEditing] = useState<boolean>(
    basicInfo.isDraft || !basicInfo.savedAt
  );
  const [showGpaModal, setShowGpaModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const createEmptyScholarshipItem = (): ReceivedScholarshipItem => ({
    id: `sch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    provider: '',
  });

  const handleAddScholarship = () => {
    setForm((prev) => ({
      ...prev,
      hasOtherScholarship: 'ได้รับทุน',
      receivedScholarships: [...(prev.receivedScholarships || []), createEmptyScholarshipItem()],
    }));
  };

  const handleUpdateScholarship = (
    index: number,
    patch: Partial<ReceivedScholarshipItem>
  ) => {
    setForm((prev) => {
      const list = [...(prev.receivedScholarships || [])];
      list[index] = { ...list[index], ...patch };
      return { ...prev, receivedScholarships: list };
    });
  };

  const handleRemoveScholarship = (index: number) => {
    setForm((prev) => {
      const nextList = (prev.receivedScholarships || []).filter((_, idx) => idx !== index);
      return {
        ...prev,
        receivedScholarships: nextList,
      };
    });
  };

  const handlePdpaConsent = async (consented: boolean) => {
    try {
      const updated = await api.savePdpaDecision(consented);
      const merged = { ...form, ...updated.basicInfo };
      setForm(merged);
      onUpdated(merged);
    } catch (err) {
      setFeedback({ type: 'error', text: (err as Error).message });
    }
  };

  const renderSelfDeleteSection = () =>
    onDeleteAccount ? (
      <section className="rounded-2xl border border-[#FCA5A5]/70 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="font-display text-sm font-bold text-[#991B1B]">
            การลบบัญชีผู้ใช้และข้อมูลส่วนบุคคล (PDPA)
          </h3>
          <p className="text-xs text-[#66585B]">
            หากต้องการยกเลิกการใช้งาน สามารถลบบัญชีและข้อมูลทั้งหมดออกจากระบบได้ถาวร
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>ลบบัญชีผู้ใช้ของฉัน</span>
        </button>
      </section>
    ) : null;

  const renderSelfDeleteModal = () =>
    showDeleteConfirm && onDeleteAccount ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ยืนยันการลบบัญชีผู้ใช้ของฉัน"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <div className="w-full max-w-md rounded-2xl border border-[#FCA5A5] bg-white p-6 space-y-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-[#991B1B]">
                ยืนยันการลบบัญชีผู้ใช้
              </h3>
              <p className="text-xs text-[#66585B] mt-1 leading-relaxed">
                ข้อมูลพื้นฐาน ใบสมัครทุน ผลการเรียน และชั่วโมงจิตอาสาของคุณจะถูกลบออกจากระบบถาวร และไม่สามารถกู้คืนได้
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={deletingAccount}
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-xl border border-[#D8CBB8] px-4 py-2 text-sm text-[#5A4B4E] hover:bg-[#FAF6EE]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={deletingAccount}
              onClick={async () => {
                setDeletingAccount(true);
                try {
                  await onDeleteAccount();
                } catch (err) {
                  setFeedback({ type: 'error', text: (err as Error).message });
                  setShowDeleteConfirm(false);
                } finally {
                  setDeletingAccount(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{deletingAccount ? 'กำลังลบบัญชี...' : 'ยืนยันลบบัญชี'}</span>
            </button>
          </div>
        </div>
      </div>
    ) : null;

  if (!form.pdpaConsented) {
    return (
      <div className="space-y-6">
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
        <PdpaConsentModal
          declined={Boolean(form.pdpaDeclined)}
          onConsent={() => handlePdpaConsent(true)}
          onDecline={() => handlePdpaConsent(false)}
        />
        {renderSelfDeleteSection()}
        {renderSelfDeleteModal()}
      </div>
    );
  }

  const handleSave = async (asDraft: boolean) => {
    setFeedback(null);
    const cleanedScholarships =
      form.hasOtherScholarship === 'ได้รับทุน'
        ? sanitizeReceivedScholarships(form.receivedScholarships)
        : [];

    if (!asDraft) {
      if (!form.studentId.trim() || !form.fullName.trim() || !form.phone.trim()) {
        setFeedback({
          type: 'error',
          text: 'กรุณากรอกรหัสนักศึกษา ชื่อ-นามสกุล และเบอร์โทรศัพท์ให้ครบถ้วนก่อนบันทึก',
        });
        return;
      }
      if (!form.gpax.trim() || !form.gpaTerm1.trim() || !form.gpaTerm2.trim()) {
        setFeedback({
          type: 'error',
          text: 'กรุณากรอกข้อมูลเกรดเฉลี่ย (GPAX, ภาคเรียนที่ 1, ภาคเรียนที่ 2) ในหน้าต่างเกรดเฉลี่ย',
        });
        setShowGpaModal(true);
        return;
      }
      if (form.hasOtherScholarship === 'ได้รับทุน' && cleanedScholarships.length === 0) {
        setFeedback({
          type: 'error',
          text: 'กรุณาระบุชื่อทุนการศึกษาที่ได้รับอย่างน้อย 1 รายการ (หรือเลือก "ไม่ได้รับทุน")',
        });
        return;
      }
    }

    setSaving(true);
    try {
      const summaryText =
        form.hasOtherScholarship === 'ได้รับทุน'
          ? cleanedScholarships
              .map((s) => (s.provider ? `${s.name} (${s.provider})` : s.name))
              .join(', ')
          : '';
      const payload: BasicInfoData = {
        ...form,
        receivedScholarships: cleanedScholarships,
        otherScholarshipDetail: summaryText,
        isDraft: asDraft,
      };
      const res = await api.saveBasicInfo(payload);
      setForm(res.basicInfo);
      onUpdated(res.basicInfo);
      if (!asDraft) {
        setIsEditing(false);
      }
      setFeedback({
        type: 'success',
        text: asDraft
          ? 'บันทึกฉบับร่างข้อมูลพื้นฐานเรียบร้อยแล้ว'
          : 'บันทึกข้อมูลพื้นฐานเรียบร้อยแล้ว ระบบแสดงข้อมูลทั้งหมดด้านล่างและสามารถแก้ไขได้ตลอดเวลา',
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
            1. ข้อมูลพื้นฐานนักศึกษา
          </h2>
          <p className="text-sm text-[#66585B]">
            ยินยอม PDPA เมื่อ{' '}
            {form.pdpaConsentedAt
              ? new Date(form.pdpaConsentedAt).toLocaleDateString('th-TH')
              : 'เรียบร้อยแล้ว'}{' '}
            · ข้อมูลนี้จะถูกดึงไปใช้ในใบสมัครทุนการศึกษาโดยอัตโนมัติ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#7A1629] bg-white px-4 py-2 text-sm font-medium text-[#7A1629] hover:bg-[#FAF6EE]"
            >
              <Edit3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>แก้ไขข้อมูลพื้นฐาน</span>
            </button>
          )}
          <button
            type="button"
            onClick={onGoToApplication}
            className="rounded-lg bg-[#C6922C] px-4 py-2 text-sm font-medium text-white hover:bg-[#AD7D21]"
          >
            ไปหน้าสมัครทุนการศึกษา
          </button>
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

      {/* Summary View after Saving */}
      {!isEditing && (
        <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 lg:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EAE0CE] pb-5">
            <div className="flex items-center gap-4">
              {form.profilePhoto ? (
                <img
                  src={form.profilePhoto.url}
                  alt="รูปติดบัตรนักศึกษา 1.5 นิ้ว"
                  referrerPolicy="no-referrer"
                  className="h-24 w-20 rounded-lg border border-[#D8C6A6] object-cover"
                />
              ) : (
                <div className="flex h-24 w-20 items-center justify-center rounded-lg border border-dashed border-[#D8C6A6] bg-[#FAF6EE] text-xs text-[#66585B]">
                  ไม่มีรูป 1.5&quot;
                </div>
              )}
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#166534]">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>บันทึกข้อมูลพื้นฐานแล้ว</span>
                </div>
                <h3 className="font-display text-lg font-bold text-[#23181A] mt-0.5">
                  {form.fullName || '-'}
                </h3>
                <p className="text-sm text-[#66585B] tabular-nums">
                  รหัสนักศึกษา {form.studentId || '-'} · {form.yearLevel} · ปีการศึกษา {form.academicYear}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 rounded-xl bg-[#FAF6EE] px-5 py-3 border border-[#EAE0CE] text-center">
              <div>
                <p className="text-[11px] text-[#66585B]">GPAX</p>
                <p className="font-display text-base font-bold text-[#7A1629] tabular-nums">
                  {form.gpax || '-'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#66585B]">ภาคเรียนที่ 1</p>
                <p className="font-display text-base font-bold text-[#23181A] tabular-nums">
                  {form.gpaTerm1 || '-'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#66585B]">ภาคเรียนที่ 2</p>
                <p className="font-display text-base font-bold text-[#23181A] tabular-nums">
                  {form.gpaTerm2 || '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-2">
              <h4 className="font-display font-semibold text-[#7A1629]">ข้อมูลส่วนตัวและการติดต่อ</h4>
              <p>เบอร์โทรศัพท์: <span className="tabular-nums">{form.phone || '-'}</span></p>
              <p>อีเมล: {form.email || '-'}</p>
              <p>Facebook: {form.facebook || '-'}</p>
              <p>วันเกิด: {form.birthDate || '-'} (อายุ {form.age || '-'} ปี)</p>
              <p>สัญชาติ/เชื้อชาติ/ศาสนา: {form.nationality} / {form.ethnicity} / {form.religion}</p>
              <p>ที่อยู่ตามทะเบียนบ้าน: {form.registeredAddress || '-'}</p>
              <p>ที่อยู่ปัจจุบัน: {form.currentAddress || '-'}</p>
              <p>ค่าใช้จ่ายที่ได้รับต่อเดือน: <span className="tabular-nums">{form.monthlyAllowance || '-'} บาท</span></p>
            </div>

            <div className="space-y-2">
              <h4 className="font-display font-semibold text-[#7A1629]">ทุนการศึกษา สุขภาพ และครอบครัว</h4>
              <p>โรคประจำตัว: {form.hasChronicDisease} {form.hasChronicDisease === 'มี' ? `(${form.chronicDiseaseDetail})` : ''}</p>
              <p>กยศ.: {form.hasStudentLoan} {form.hasStudentLoan === 'กู้' ? `(ปีการศึกษา ${form.studentLoanYear})` : ''}</p>
              <div>
                <p>
                  ทุนการศึกษาที่ได้รับ:{' '}
                  <span className="font-medium text-[#23181A]">
                    {form.hasOtherScholarship}
                  </span>
                </p>
                {form.hasOtherScholarship === 'ได้รับทุน' && (
                  <ul className="mt-1.5 space-y-1 pl-4 list-disc text-xs text-[#4B3F42]">
                    {sanitizeReceivedScholarships(
                      form.receivedScholarships,
                      form.otherScholarshipDetail
                    ).length > 0 ? (
                      sanitizeReceivedScholarships(
                        form.receivedScholarships,
                        form.otherScholarshipDetail
                      ).map((item) => (
                        <li key={item.id}>
                          <span className="font-semibold text-[#7A1629]">{item.name}</span>
                          {item.provider ? (
                            <span className="text-[#66585B]"> ({item.provider})</span>
                          ) : null}
                        </li>
                      ))
                    ) : (
                      <li>{formatReceivedScholarshipsText(form) || '-'}</li>
                    )}
                  </ul>
                )}
              </div>
              <p>งานพิเศษ: {form.hasPartTimeJob} {form.hasPartTimeJob === 'ทำ' ? `(${form.partTimeJobDetail})` : ''}</p>
              <p>บิดา: {form.father.fullName || '-'} · {form.father.occupation || '-'} ({form.father.monthlyIncome || '0'} บ./ด.)</p>
              <p>มารดา: {form.mother.fullName || '-'} · {form.mother.occupation || '-'} ({form.mother.monthlyIncome || '0'} บ./ด.)</p>
              <p>สถานภาพครอบครัว: {form.parentsMaritalStatus} · พักอาศัยอยู่กับ: {form.livingWith === 'อื่นๆ' ? form.livingWithOther : form.livingWith}</p>
            </div>
          </div>

          <div className="border-t border-[#EAE0CE] pt-4 space-y-2 text-sm">
            <h4 className="font-display font-semibold text-[#7A1629]">ความจำเป็นและแผนการใช้ทุน</h4>
            <p><span className="font-medium">ความจำเป็น:</span> {form.necessityReason || '-'}</p>
            <p><span className="font-medium">แผนการใช้เงินทุน:</span> {form.spendingPlan || '-'}</p>
            <p className="text-xs text-[#66585B] tabular-nums">
              รูปบ้านที่แนบ: {form.housePhotos.length} รูป · เอกสารประกอบ: {form.supportingDocs.length} ไฟล์
            </p>
          </div>
        </section>
      )}

      {/* Full Edit Form */}
      {isEditing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave(false);
          }}
          className="space-y-6"
        >
          {/* Photo Upload */}
          <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#7A1629]">
              รูปถ่ายประจำตัวนักศึกษา (1.5 นิ้ว)
            </h3>
            <FileUploadField
              label="อัปโหลดรูปตัวเอง 1.5 นิ้ว"
              helperText="*หมายเหตุ* ต้องเป็นรูปติดบัตรเท่านั้น รองรับไฟล์ JPG, PNG และ WEBP ขนาดไม่เกิน 5 MB"
              files={form.profilePhoto ? [form.profilePhoto] : []}
              onChange={(files) => setForm({ ...form, profilePhoto: files[0] || null })}
              maxSizeMB={5}
              allowPdf={false}
              multiple={false}
            />
          </section>

          {/* Part 1: Education Info */}
          <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE0CE] pb-3">
              <h3 className="font-display text-base font-bold text-[#7A1629]">
                ส่วนที่ 1 ข้อมูลการศึกษา
              </h3>
              <button
                type="button"
                onClick={() => setShowGpaModal(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#C6922C] bg-[#FDF8EC] px-4 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#F7EBCB]"
              >
                <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>เปิดหน้าต่างกรอกเกรดเฉลี่ย (GPAX / ภาคเรียน) *</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label htmlFor="bi-year" className="block text-xs font-medium text-[#23181A]">
                  ปีการศึกษา (พ.ศ.) *
                </label>
                <select
                  id="bi-year"
                  value={form.academicYear}
                  onChange={(e) =>
                    setForm({ ...form, academicYear: e.target.value as BasicInfoData['academicYear'] })
                  }
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                >
                  {ACADEMIC_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="bi-level" className="block text-xs font-medium text-[#23181A]">
                  ชั้นปี *
                </label>
                <select
                  id="bi-level"
                  value={form.yearLevel}
                  onChange={(e) =>
                    setForm({ ...form, yearLevel: e.target.value as BasicInfoData['yearLevel'] })
                  }
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                >
                  {YEAR_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="bi-stuid" className="block text-xs font-medium text-[#23181A]">
                  รหัสนักศึกษา *
                </label>
                <input
                  id="bi-stuid"
                  type="text"
                  required
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label htmlFor="bi-name" className="block text-xs font-medium text-[#23181A]">
                  ชื่อ-นามสกุล *
                </label>
                <input
                  id="bi-name"
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="bi-cohort" className="block text-xs font-medium text-[#23181A]">
                  รุ่น/รหัสเข้าศึกษา
                </label>
                <input
                  id="bi-cohort"
                  type="text"
                  value={form.cohort}
                  onChange={(e) => setForm({ ...form, cohort: e.target.value })}
                  placeholder="เช่น 67"
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="bi-phone" className="block text-xs font-medium text-[#23181A]">
                  เบอร์โทรศัพท์ *
                </label>
                <input
                  id="bi-phone"
                  type="text"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between gap-4 rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] px-4 py-2.5 text-sm">
                <div className="flex flex-wrap gap-6 tabular-nums">
                  <span>GPAX: <strong>{form.gpax || 'ยังไม่กรอก'}</strong></span>
                  <span>ภาคเรียนที่ 1: <strong>{form.gpaTerm1 || 'ยังไม่กรอก'}</strong></span>
                  <span>ภาคเรียนที่ 2: <strong>{form.gpaTerm2 || 'ยังไม่กรอก'}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGpaModal(true)}
                  className="text-xs font-semibold text-[#7A1629] hover:underline whitespace-nowrap"
                >
                  แก้ไขเกรด
                </button>
              </div>
            </div>
          </section>

          {/* Part 2: Personal Info */}
          <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5">
            <h3 className="font-display text-base font-bold text-[#7A1629] border-b border-[#EAE0CE] pb-3">
              ส่วนที่ 2 ข้อมูลส่วนตัว
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">วันเดือนปีเกิด *</label>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">อายุ *</label>
                <input
                  type="text"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">สัญชาติ *</label>
                <input
                  type="text"
                  value={form.nationality}
                  onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">เชื้อชาติ *</label>
                <input
                  type="text"
                  value={form.ethnicity}
                  onChange={(e) => setForm({ ...form, ethnicity: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">ศาสนา *</label>
                <input
                  type="text"
                  value={form.religion}
                  onChange={(e) => setForm({ ...form, religion: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">Facebook *</label>
                <input
                  type="text"
                  value={form.facebook}
                  onChange={(e) => setForm({ ...form, facebook: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">จำนวนเงินที่ได้รับต่อเดือน (บาท)</label>
                <input
                  type="text"
                  value={form.monthlyAllowance}
                  onChange={(e) => setForm({ ...form, monthlyAllowance: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">ที่อยู่ตามทะเบียนบ้าน *</label>
                <textarea
                  rows={2}
                  value={form.registeredAddress}
                  onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <label className="block text-xs font-medium text-[#23181A]">ที่อยู่ปัจจุบัน *</label>
                <textarea
                  rows={2}
                  value={form.currentAddress}
                  onChange={(e) => setForm({ ...form, currentAddress: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Conditional fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#EAE0CE]">
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#23181A]">มีโรคประจำตัวหรือไม่</span>
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
                    placeholder="ระบุรายละเอียดโรคประจำตัว"
                    className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#23181A]">กู้ยืมเงิน กยศ. หรือไม่</span>
                <div className="flex gap-4 text-sm">
                  {(['กู้', 'ไม่กู้'] as const).map((opt) => (
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
                {form.hasStudentLoan === 'กู้' && (
                  <input
                    type="text"
                    value={form.studentLoanYear}
                    onChange={(e) => setForm({ ...form, studentLoanYear: e.target.value })}
                    placeholder="ระบุปีการศึกษาที่กู้ เช่น 2569"
                    className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#23181A]">ทำงานพิเศษหรือไม่</span>
                <div className="flex gap-4 text-sm">
                  {(['ทำ', 'ไม่ทำ'] as const).map((opt) => (
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
                {form.hasPartTimeJob === 'ทำ' && (
                  <input
                    type="text"
                    value={form.partTimeJobDetail}
                    onChange={(e) => setForm({ ...form, partTimeJobDetail: e.target.value })}
                    placeholder="ระบุรายละเอียดงานพิเศษ"
                    className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div className="md:col-span-2 space-y-3 rounded-xl border border-[#EAE0CE] bg-[#FAF6EE]/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="block text-xs font-semibold text-[#7A1629]">
                      ทุนการศึกษาที่ได้รับ (สามารถเพิ่มได้หลายทุน ไม่จำกัดจำนวน)
                    </span>
                    <p className="text-[11px] text-[#66585B] mt-0.5">
                      พิมพ์ชื่อทุนการศึกษาได้เองอย่างอิสระ รองรับทุนจากหลายหน่วยงาน · เมื่อกด &quot;บันทึกข้อมูลพื้นฐาน&quot; ข้อมูลจะสรุปบนหน้า Dashboard โดยอัตโนมัติ
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    {(['ได้รับทุน', 'ไม่ได้รับทุน'] as const).map((opt) => (
                      <label key={opt} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="hasOtherScholarship"
                          checked={form.hasOtherScholarship === opt}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              hasOtherScholarship: opt,
                              receivedScholarships:
                                opt === 'ได้รับทุน' &&
                                (!prev.receivedScholarships || prev.receivedScholarships.length === 0)
                                  ? [createEmptyScholarshipItem()]
                                  : prev.receivedScholarships,
                            }))
                          }
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {form.hasOtherScholarship === 'ได้รับทุน' && (
                  <div className="space-y-3 pt-1">
                    {(form.receivedScholarships || []).length === 0 && (
                      <p className="rounded-lg border border-dashed border-[#DFD1BA] bg-white px-3 py-2 text-xs text-[#66585B]">
                        ยังไม่มีรายการทุนการศึกษา กดปุ่ม &quot;เพิ่มทุนการศึกษา&quot; ด้านล่างเพื่อระบุชื่อทุนที่ได้รับ
                      </p>
                    )}
                    {(form.receivedScholarships || []).map((item, idx) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end rounded-xl border border-[#DFD1BA] bg-white p-3"
                      >
                        <div className="md:col-span-6 space-y-1">
                          <label
                            htmlFor={`scholarship-name-${idx}`}
                            className="block text-[11px] font-medium text-[#23181A]"
                          >
                            ชื่อทุนการศึกษา รายการที่ {idx + 1} *
                          </label>
                          <input
                            id={`scholarship-name-${idx}`}
                            type="text"
                            value={item.name}
                            onChange={(e) =>
                              handleUpdateScholarship(idx, { name: e.target.value })
                            }
                            placeholder="พิมพ์ชื่อทุนอย่างอิสระ เช่น ทุน CYF, ทุนผู้ช่วยศาสตราจารย์ ดร. กิตติกร"
                            className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="md:col-span-4 space-y-1">
                          <label
                            htmlFor={`scholarship-provider-${idx}`}
                            className="block text-[11px] font-medium text-[#23181A]"
                          >
                            หน่วยงาน / แหล่งทุน (ไม่บังคับ)
                          </label>
                          <input
                            id={`scholarship-provider-${idx}`}
                            type="text"
                            value={item.provider || ''}
                            onChange={(e) =>
                              handleUpdateScholarship(idx, { provider: e.target.value })
                            }
                            placeholder="เช่น มูลนิธิ, มหาวิทยาลัย, คณะ"
                            className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="md:col-span-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveScholarship(idx)}
                            aria-label={`ลบทุนการศึกษา รายการที่ ${idx + 1}${item.name ? ` (${item.name})` : ''}`}
                            className="w-full md:w-auto inline-flex items-center justify-center gap-1 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs font-medium text-[#991B1B] hover:bg-[#FEE2E2] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>ลบ</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    <div>
                      <button
                        type="button"
                        onClick={handleAddScholarship}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#C6922C] bg-[#FDF8EC] px-4 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#F7EBCB] transition-colors"
                      >
                        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>เพิ่มทุนการศึกษา</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Part 3: Family */}
          <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5">
            <h3 className="font-display text-base font-bold text-[#7A1629] border-b border-[#EAE0CE] pb-3">
              ส่วนที่ 3 ข้อมูลบิดา มารดา ผู้ปกครอง และที่อยู่อาศัย
            </h3>

            <ParentFieldsGroup
              title="3.1 ข้อมูลบิดา"
              value={form.father}
              onChange={(father) => setForm({ ...form, father })}
            />

            <ParentFieldsGroup
              title="3.2 ข้อมูลมารดา"
              value={form.mother}
              onChange={(mother) => setForm({ ...form, mother })}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-[#EAE0CE] p-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#23181A]">
                  3.3 สถานภาพสมรสของบิดามารดา
                </label>
                <select
                  value={form.parentsMaritalStatus}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      parentsMaritalStatus: e.target.value as BasicInfoData['parentsMaritalStatus'],
                    })
                  }
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                >
                  <option value="อยู่ด้วยกัน">อยู่ด้วยกัน</option>
                  <option value="แยกกันอยู่">แยกกันอยู่</option>
                  <option value="หย่าร้าง">หย่าร้าง</option>
                  <option value="บิดาเสียชีวิต">บิดาเสียชีวิต</option>
                  <option value="มารดาเสียชีวิต">มารดาเสียชีวิต</option>
                  <option value="อื่นๆ">อื่นๆ (โปรดระบุ...)</option>
                </select>
                {form.parentsMaritalStatus === 'อื่นๆ' && (
                  <input
                    type="text"
                    value={form.parentsMaritalStatusOther}
                    onChange={(e) =>
                      setForm({ ...form, parentsMaritalStatusOther: e.target.value })
                    }
                    placeholder="โปรดระบุสถานภาพสมรส"
                    className="mt-2 w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#23181A]">
                  3.5 ลักษณะที่อยู่อาศัย (พักอาศัยอยู่กับใคร)
                </label>
                <select
                  value={form.livingWith}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      livingWith: e.target.value as BasicInfoData['livingWith'],
                    })
                  }
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
                >
                  <option value="พ่อ">พ่อ</option>
                  <option value="แม่">แม่</option>
                  <option value="ปู่ ย่า ตา ยาย">ปู่ ย่า ตา ยาย</option>
                  <option value="อื่นๆ">อื่นๆ (โปรดระบุ)</option>
                </select>
                {form.livingWith === 'อื่นๆ' && (
                  <input
                    type="text"
                    value={form.livingWithOther}
                    onChange={(e) => setForm({ ...form, livingWithOther: e.target.value })}
                    placeholder="โปรดระบุผู้ที่พักอาศัยอยู่ด้วย"
                    className="mt-2 w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm"
                  />
                )}
              </div>
            </div>

            <ParentFieldsGroup
              title="3.4 ข้อมูลผู้ปกครองและครอบครัว (กรณีไม่ใช่บิดาหรือมารดา)"
              value={form.guardian}
              onChange={(guardian) =>
                setForm({
                  ...form,
                  guardian: { ...guardian, relationship: form.guardian.relationship },
                })
              }
              required={false}
              showRelationship
              relationshipValue={form.guardian.relationship}
              onRelationshipChange={(relationship) =>
                setForm({
                  ...form,
                  guardian: { ...form.guardian, relationship },
                })
              }
            />

            <div className="max-w-xs space-y-1">
              <label className="block text-xs font-medium text-[#23181A]">
                จำนวนสมาชิกในครอบครัว (ไม่รวมนักศึกษา)
              </label>
              <input
                type="text"
                value={form.familyMemberCount}
                onChange={(e) => setForm({ ...form, familyMemberCount: e.target.value })}
                className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </section>

          {/* Part 4: Necessity */}
          <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#7A1629] border-b border-[#EAE0CE] pb-3">
              ส่วนที่ 4 ความจำเป็นในการขอรับทุนการศึกษา
            </h3>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#23181A]">
                1. อธิบายความจำเป็นในการขอรับทุนการศึกษา
              </label>
              <textarea
                rows={3}
                value={form.necessityReason}
                onChange={(e) => setForm({ ...form, necessityReason: e.target.value })}
                className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#23181A]">
                2. แผนการใช้เงินทุนการศึกษา
              </label>
              <textarea
                rows={3}
                value={form.spendingPlan}
                onChange={(e) => setForm({ ...form, spendingPlan: e.target.value })}
                className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
              />
            </div>
          </section>

          {/* Part 5: Documents */}
          <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5">
            <div className="border-b border-[#EAE0CE] pb-3">
              <h3 className="font-display text-base font-bold text-[#7A1629]">
                ส่วนที่ 5 เอกสารประกอบการขอรับทุน
              </h3>
              <p className="text-xs text-[#66585B] mt-1">
                ขนาดไฟล์ไม่เกิน 5 MB ต่อไฟล์ รองรับ PDF, JPG, PNG และ WEBP หากยังไม่มีเอกสาร
                สามารถบันทึกฉบับร่างไว้ก่อนและแนบเอกสารภายหลังได้
              </p>
            </div>

            <FileUploadField
              label="1. แนบรูปบ้าน อย่างน้อย 2 รูป (เห็นรูปภายในบริเวณบ้าน และ นอกบ้าน พร้อมผู้ปกครองทุกรูป)"
              helperText="รองรับไฟล์ภาพ JPG, PNG, WEBP หรือ PDF สูงสุด 5 MB ต่อไฟล์"
              files={form.housePhotos}
              onChange={(housePhotos) => setForm({ ...form, housePhotos })}
              maxSizeMB={5}
              allowPdf={true}
              minCount={2}
            />

            <FileUploadField
              label="2. อัปโหลดไฟล์เอกสารประกอบอื่น ๆ"
              helperText="เช่น สำเนาบัตรประชาชน สำเนาทะเบียนบ้าน หนังสือรับรองรายได้ (สูงสุด 5 MB)"
              files={form.supportingDocs}
              onChange={(supportingDocs) => setForm({ ...form, supportingDocs })}
              maxSizeMB={5}
              allowPdf={true}
            />

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#23181A]">
                3. หมายเหตุเพิ่มเติมเกี่ยวกับเอกสาร (ถ้ามี)
              </label>
              <textarea
                rows={2}
                value={form.documentNote}
                onChange={(e) => setForm({ ...form, documentNote: e.target.value })}
                className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-sm"
              />
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="rounded-lg border border-[#D8CBB8] bg-white px-5 py-2.5 text-sm font-medium text-[#23181A] hover:bg-[#FAF6EE]"
            >
              บันทึกฉบับร่าง
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#7A1629] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D]"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลพื้นฐาน'}
            </button>
          </div>
        </form>
      )}

      {/* Separate Sub-Window Modal for GPA Entry (ทำหน้าต่างแยกออกมา) */}
      {showGpaModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gpa-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#D8C6A6] bg-white p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#EAE0CE] pb-3">
              <h3 id="gpa-modal-title" className="font-display text-lg font-bold text-[#7A1629]">
                หน้าต่างบันทึกเกรดเฉลี่ย
              </h3>
              <button
                type="button"
                onClick={() => setShowGpaModal(false)}
                aria-label="ปิดหน้าต่างเกรดเฉลี่ย"
                className="rounded-lg p-1 text-[#66585B] hover:bg-[#FAF6EE]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="gpa-gpax" className="block text-sm font-medium text-[#23181A]">
                  เกรดเฉลี่ยสะสม (GPAX) *
                </label>
                <input
                  id="gpa-gpax"
                  type="text"
                  value={form.gpax}
                  onChange={(e) => setForm({ ...form, gpax: e.target.value })}
                  placeholder="เช่น 3.55"
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3.5 py-2 text-sm tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="gpa-t1" className="block text-sm font-medium text-[#23181A]">
                  เกรดเฉลี่ยภาคเรียนที่ 1 ที่ผ่านมา *
                </label>
                <input
                  id="gpa-t1"
                  type="text"
                  value={form.gpaTerm1}
                  onChange={(e) => setForm({ ...form, gpaTerm1: e.target.value })}
                  placeholder="เช่น 3.50"
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3.5 py-2 text-sm tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="gpa-t2" className="block text-sm font-medium text-[#23181A]">
                  เกรดเฉลี่ยภาคเรียนที่ 2 ที่ผ่านมา *
                </label>
                <input
                  id="gpa-t2"
                  type="text"
                  value={form.gpaTerm2}
                  onChange={(e) => setForm({ ...form, gpaTerm2: e.target.value })}
                  placeholder="เช่น 3.60"
                  className="w-full rounded-lg border border-[#D8CBB8] bg-[#FAF6EE] px-3.5 py-2 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowGpaModal(false)}
                className="rounded-lg bg-[#7A1629] px-5 py-2 text-sm font-medium text-white hover:bg-[#5B0F1D]"
              >
                ตกลงและบันทึกค่าเกรด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDPA Self-Service Account Deletion */}
      {renderSelfDeleteSection()}
      {renderSelfDeleteModal()}
    </div>
  );
}
