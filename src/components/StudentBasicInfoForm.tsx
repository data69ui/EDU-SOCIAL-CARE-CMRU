import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { Edit3, Award, CheckCircle2, X, Trash2, AlertTriangle, Plus } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { api } from '../services/api';
import type { BasicInfoData, ParentInfo, ReceivedScholarshipItem } from '../types/scholarship';
import {
  ACADEMIC_YEARS,
  YEAR_LEVELS,
  formatReceivedScholarshipsText,
  sanitizeReceivedScholarships,
} from '../utils/scholarshipLogic';
import { FileUploadField } from './FileUploadField';
import { DriveImage } from './DriveMedia';
import { PdpaConsentModal } from './PdpaConsentModal';
import { useSaveSuccess } from '../contexts/SaveSuccessContext';

interface StudentBasicInfoFormProps {
  basicInfo: BasicInfoData;
  draftBasicInfo?: BasicInfoData | null;
  onDraftChange?: (draft: BasicInfoData | null) => void;
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
    <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE]/60 dark:bg-[#1B1D23] p-5 space-y-4">
      <h4 className="font-display text-sm font-semibold text-[#7A1629] dark:text-[#F3B9C3]">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-1">
          <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
            ชื่อ-นามสกุล {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.fullName}
            onChange={(e) => onChange({ ...value, fullName: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
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
            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
          >
            <option value="">-- เลือก --</option>
            <option value="ยังมีชีวิตอยู่">ยังมีชีวิตอยู่</option>
            <option value="ถึงแก่กรรม">ถึงแก่กรรม</option>
          </select>
        </div>

        {showRelationship && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
              ความสัมพันธ์กับผู้ปกครอง
            </label>
            <input
              type="text"
              value={relationshipValue}
              onChange={(e) => onRelationshipChange?.(e.target.value)}
              placeholder="เช่น ป้า, ลุง, ยาย"
              className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
            อายุ {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.age}
            onChange={(e) => onChange({ ...value, age: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
            อาชีพ {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.occupation}
            onChange={(e) => onChange({ ...value, occupation: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
            สถานที่ทำงาน {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.workplace}
            onChange={(e) => onChange({ ...value, workplace: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
            รายได้ต่อเดือน (บาท) {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.monthlyIncome}
            onChange={(e) => onChange({ ...value, monthlyIncome: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
            เบอร์โทรศัพท์ {required ? '*' : ''}
          </label>
          <input
            type="text"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}

export function StudentBasicInfoForm({
  basicInfo,
  draftBasicInfo,
  onDraftChange,
  onUpdated,
  onGoToApplication,
  onDeleteAccount,
}: StudentBasicInfoFormProps) {
  const [form, setFormState] = useState<BasicInfoData>(() => {
    const source = draftBasicInfo || basicInfo;
    return {
      ...source,
      receivedScholarships:
        source.hasOtherScholarship === 'ได้รับทุน'
          ? sanitizeReceivedScholarships(source.receivedScholarships, source.otherScholarshipDetail)
          : [],
    };
  });
  const isDirtyRef = useRef(Boolean(draftBasicInfo));
  const setForm = (updater: SetStateAction<BasicInfoData>) => {
    isDirtyRef.current = true;
    setFormState(updater);
  };
  useEffect(() => {
    if (isDirtyRef.current) {
      onDraftChange?.(form);
    }
  }, [form]);

  const { showSaveSuccess } = useSaveSuccess();
  const prefersReducedMotion = useReducedMotion();
  const [isEditing, setIsEditing] = useState<boolean>(
    Boolean(draftBasicInfo) || basicInfo.isDraft || !basicInfo.savedAt
  );
  const [showGpaModal, setShowGpaModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!showGpaModal && !showDeleteConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showGpaModal) setShowGpaModal(false);
        else if (showDeleteConfirm && !deletingAccount) setShowDeleteConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGpaModal, showDeleteConfirm, deletingAccount]);

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
      isDirtyRef.current = false;
      setFormState(merged);
      onDraftChange?.(null);
      onUpdated(merged);
      showSaveSuccess(
        consented
          ? 'บันทึกความยินยอม PDPA เรียบร้อยแล้ว สามารถกรอกข้อมูลพื้นฐานได้ทันที'
          : 'บันทึกผลการพิจารณา PDPA เรียบร้อยแล้ว',
        'บันทึกข้อมูลเสร็จสิ้นแล้ว'
      );
    } catch (err) {
      setFeedback({ type: 'error', text: (err as Error).message });
    }
  };

  const renderSelfDeleteSection = () =>
    onDeleteAccount ? (
      <section className="rounded-2xl border border-[#FCA5A5]/70 dark:border-red-900/60 bg-white dark:bg-[#22242B] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="font-display text-sm font-bold text-[#991B1B] dark:text-red-300">
            การลบบัญชีผู้ใช้และข้อมูลส่วนบุคคล (PDPA)
          </h3>
          <p className="text-xs text-[#66585B] dark:text-[#A19B91]">
            หากต้องการยกเลิกการใช้งาน สามารถลบบัญชีและข้อมูลทั้งหมดออกจากระบบได้ถาวร
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#FCA5A5] dark:border-red-900/70 bg-[#FEF2F2] dark:bg-red-950/40 px-4 py-2 text-xs font-semibold text-[#991B1B] dark:text-red-300 hover:bg-[#FEE2E2] dark:hover:bg-red-950/70 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>ลบบัญชีผู้ใช้ของฉัน</span>
        </button>
      </section>
    ) : null;

  const renderSelfDeleteModal = () => (
    <AnimatePresence>
      {showDeleteConfirm && onDeleteAccount && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="ยืนยันการลบบัญชีผู้ใช้ของฉัน"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.15, ease: 'easeOut' }}
          style={{ willChange: 'opacity' }}
          onClick={(e) => {
            if (!deletingAccount && e.target === e.currentTarget) setShowDeleteConfirm(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4 }}
            transition={{
              duration: prefersReducedMotion ? 0.01 : 0.17,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ willChange: 'transform, opacity' }}
            className="w-full max-w-md rounded-2xl border border-[#FCA5A5] dark:border-red-900/70 bg-white dark:bg-[#22242B] p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] dark:bg-red-950/60 text-[#B91C1C] dark:text-red-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-[#991B1B] dark:text-red-300">
                  ยืนยันการลบบัญชีผู้ใช้
                </h3>
                <p className="text-xs text-[#66585B] dark:text-[#A19B91] mt-1 leading-relaxed">
                  ข้อมูลพื้นฐาน ใบสมัครทุน ผลการเรียน และชั่วโมงจิตอาสาของคุณจะถูกลบออกจากระบบถาวร และไม่สามารถกู้คืนได้
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] px-4 py-2 text-sm text-[#5A4B4E] dark:text-[#D1CBC2] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]"
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!form.pdpaConsented) {
    return (
      <div className="space-y-6">
        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border px-4 py-3 text-sm ${
              feedback.type === 'error'
                ? 'border-[#FCA5A5] dark:border-red-900/70 bg-[#FEF2F2] dark:bg-red-950/50 text-[#991B1B] dark:text-red-300'
                : 'border-[#86EFAC] dark:border-emerald-900/70 bg-[#F0FDF4] dark:bg-emerald-950/50 text-[#166534] dark:text-emerald-300'
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
      isDirtyRef.current = false;
      setFormState(res.basicInfo);
      onDraftChange?.(null);
      onUpdated(res.basicInfo);
      if (!asDraft) {
        setIsEditing(false);
      }
      const successMessage = asDraft
        ? 'บันทึกฉบับร่างข้อมูลพื้นฐานเรียบร้อยแล้ว'
        : 'บันทึกข้อมูลพื้นฐานเรียบร้อยแล้ว ระบบแสดงข้อมูลทั้งหมดด้านล่างและสามารถแก้ไขได้ตลอดเวลา';
      setFeedback({
        type: 'success',
        text: successMessage,
      });
      showSaveSuccess(
        successMessage,
        asDraft ? 'บันทึกฉบับร่างเสร็จสิ้นแล้ว' : 'บันทึกข้อมูลเสร็จสิ้นแล้ว'
      );
    } catch (err) {
      setFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6">
        <div>
          <h2 className="font-display text-xl font-bold text-[#7A1629] dark:text-[#F3B9C3]">
            1. ข้อมูลพื้นฐานนักศึกษา
          </h2>
          <p className="text-sm text-[#66585B] dark:text-[#A19B91]">
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
              className="inline-flex items-center gap-2 rounded-lg border border-[#7A1629] dark:border-[#E8C97A]/50 bg-white dark:bg-[#1B1D23] px-4 py-2 text-sm font-medium text-[#7A1629] dark:text-[#F8E7B8] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]"
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
              ? 'border-[#FCA5A5] dark:border-red-900/70 bg-[#FEF2F2] dark:bg-red-950/50 text-[#991B1B] dark:text-red-300'
              : 'border-[#86EFAC] dark:border-emerald-900/70 bg-[#F0FDF4] dark:bg-emerald-950/50 text-[#166534] dark:text-emerald-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Summary View after Saving */}
      {!isEditing && (
        <section className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 lg:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EAE0CE] dark:border-[#343842] pb-5">
            <div className="flex items-center gap-4">
              {form.profilePhoto ? (
                <DriveImage
                  src={form.profilePhoto.url}
                  driveFileId={form.profilePhoto.driveFileId}
                  alt="รูปติดบัตรนักศึกษา 1.5 นิ้ว"
                  className="h-24 w-20 rounded-lg border border-[#D8C6A6] dark:border-[#434856] object-cover"
                />
              ) : (
                <div className="flex h-24 w-20 items-center justify-center rounded-lg border border-dashed border-[#D8C6A6] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1B1D23] text-xs text-[#66585B] dark:text-[#A19B91]">
                  ไม่มีรูป 1.5&quot;
                </div>
              )}
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#166534] dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>บันทึกข้อมูลพื้นฐานแล้ว</span>
                </div>
                <h3 className="font-display text-lg font-bold text-[#23181A] dark:text-[#F2EFEA] mt-0.5">
                  {form.fullName || '-'}
                </h3>
                <p className="text-sm text-[#66585B] dark:text-[#A19B91] tabular-nums">
                  รหัสนักศึกษา {form.studentId || '-'} · {form.yearLevel} · ปีการศึกษา {form.academicYear}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 rounded-xl bg-[#FAF6EE] dark:bg-[#1B1D23] px-5 py-3 border border-[#EAE0CE] dark:border-[#343842] text-center">
              <div>
                <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">GPAX</p>
                <p className="font-display text-base font-bold text-[#7A1629] dark:text-[#F3B9C3] tabular-nums">
                  {form.gpax || '-'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">ภาคเรียนที่ 1</p>
                <p className="font-display text-base font-bold text-[#23181A] dark:text-[#F2EFEA] tabular-nums">
                  {form.gpaTerm1 || '-'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">ภาคเรียนที่ 2</p>
                <p className="font-display text-base font-bold text-[#23181A] dark:text-[#F2EFEA] tabular-nums">
                  {form.gpaTerm2 || '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-[#23181A] dark:text-[#D1CBC2]">
            <div className="space-y-2">
              <h4 className="font-display font-semibold text-[#7A1629] dark:text-[#F3B9C3]">ข้อมูลส่วนตัวและการติดต่อ</h4>
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
              <h4 className="font-display font-semibold text-[#7A1629] dark:text-[#F3B9C3]">ทุนการศึกษา สุขภาพ และครอบครัว</h4>
              <p>โรคประจำตัว: {form.hasChronicDisease} {form.hasChronicDisease === 'มี' ? `(${form.chronicDiseaseDetail})` : ''}</p>
              <p>กยศ.: {form.hasStudentLoan} {form.hasStudentLoan === 'กู้' ? `(ปีการศึกษา ${form.studentLoanYear})` : ''}</p>
              <div>
                <p>
                  ทุนการศึกษาที่ได้รับ:{' '}
                  <span className="font-medium text-[#23181A] dark:text-[#F2EFEA]">
                    {form.hasOtherScholarship}
                  </span>
                </p>
                {form.hasOtherScholarship === 'ได้รับทุน' && (
                  <ul className="mt-1.5 space-y-1 pl-4 list-disc text-xs text-[#4B3F42] dark:text-[#C5BEB3]">
                    {sanitizeReceivedScholarships(
                      form.receivedScholarships,
                      form.otherScholarshipDetail
                    ).length > 0 ? (
                      sanitizeReceivedScholarships(
                        form.receivedScholarships,
                        form.otherScholarshipDetail
                      ).map((item) => (
                        <li key={item.id}>
                          <span className="font-semibold text-[#7A1629] dark:text-[#F3B9C3]">{item.name}</span>
                          {item.provider ? (
                            <span className="text-[#66585B] dark:text-[#A19B91]"> ({item.provider})</span>
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

          <div className="border-t border-[#EAE0CE] dark:border-[#343842] pt-4 space-y-2 text-sm text-[#23181A] dark:text-[#D1CBC2]">
            <h4 className="font-display font-semibold text-[#7A1629] dark:text-[#F3B9C3]">ความจำเป็นและแผนการใช้ทุน</h4>
            <p><span className="font-medium text-[#23181A] dark:text-[#F2EFEA]">ความจำเป็น:</span> {form.necessityReason || '-'}</p>
            <p><span className="font-medium text-[#23181A] dark:text-[#F2EFEA]">แผนการใช้เงินทุน:</span> {form.spendingPlan || '-'}</p>
            <p className="text-xs text-[#66585B] dark:text-[#A19B91] tabular-nums">
              รูปบ้านที่แนบ: {form.housePhotos.length} รูป
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
          <section className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#7A1629] dark:text-[#F3B9C3]">
              รูปถ่ายประจำตัวนักศึกษา (1.5 นิ้ว)
            </h3>
            <FileUploadField
              label="อัปโหลดรูปตัวเอง 1.5 นิ้ว"
              helperText="*หมายเหตุ* ต้องเป็นรูปติดบัตรเท่านั้น รองรับไฟล์ JPG, PNG และ WEBP ขนาดไม่เกิน 3 MB"
              files={form.profilePhoto ? [form.profilePhoto] : []}
              onChange={(files) => {
                const next = { ...form, profilePhoto: files[0] || null };
                setForm(next);
                void api
                  .saveBasicInfo(next)
                  .then((res) => onUpdated(res.basicInfo))
                  .catch(() => {});
              }}
              maxSizeMB={3}
              allowPdf={false}
              multiple={false}
              studentId={form.studentId || basicInfo.studentId}
            />
          </section>

          {/* Part 1: Education Info */}
          <section className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
              <h3 className="font-display text-base font-bold text-[#7A1629] dark:text-[#F3B9C3]">
                ส่วนที่ 1 ข้อมูลการศึกษา
              </h3>
              <button
                type="button"
                onClick={() => setShowGpaModal(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#C6922C] dark:border-[#E8C97A]/50 bg-[#FDF8EC] dark:bg-[#2B2518] px-4 py-2 text-xs font-semibold text-[#7A1629] dark:text-[#F8E7B8] hover:bg-[#F7EBCB] dark:hover:bg-[#38301E]"
              >
                <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>เปิดหน้าต่างกรอกเกรดเฉลี่ย (GPAX / ภาคเรียน) *</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label htmlFor="bi-year" className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                  ปีการศึกษา (พ.ศ.) *
                </label>
                <select
                  id="bi-year"
                  value={form.academicYear}
                  onChange={(e) =>
                    setForm({ ...form, academicYear: e.target.value as BasicInfoData['academicYear'] })
                  }
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                >
                  {ACADEMIC_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="bi-level" className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                  ชั้นปี *
                </label>
                <select
                  id="bi-level"
                  value={form.yearLevel}
                  onChange={(e) =>
                    setForm({ ...form, yearLevel: e.target.value as BasicInfoData['yearLevel'] })
                  }
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                >
                  {YEAR_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="bi-stuid" className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                  รหัสนักศึกษา *
                </label>
                <input
                  id="bi-stuid"
                  type="text"
                  required
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label htmlFor="bi-name" className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                  ชื่อ-นามสกุล *
                </label>
                <input
                  id="bi-name"
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="bi-cohort" className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                  รุ่น/รหัสเข้าศึกษา
                </label>
                <input
                  id="bi-cohort"
                  type="text"
                  value={form.cohort}
                  onChange={(e) => setForm({ ...form, cohort: e.target.value })}
                  placeholder="เช่น 67"
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="bi-phone" className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                  เบอร์โทรศัพท์ *
                </label>
                <input
                  id="bi-phone"
                  type="text"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between gap-4 rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1B1D23] px-4 py-2.5 text-sm text-[#23181A] dark:text-[#F2EFEA]">
                <div className="flex flex-wrap gap-6 tabular-nums">
                  <span>GPAX: <strong>{form.gpax || 'ยังไม่กรอก'}</strong></span>
                  <span>ภาคเรียนที่ 1: <strong>{form.gpaTerm1 || 'ยังไม่กรอก'}</strong></span>
                  <span>ภาคเรียนที่ 2: <strong>{form.gpaTerm2 || 'ยังไม่กรอก'}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGpaModal(true)}
                  className="text-xs font-semibold text-[#7A1629] dark:text-[#E8C97A] hover:underline whitespace-nowrap"
                >
                  แก้ไขเกรด
                </button>
              </div>
            </div>
          </section>

          {/* Part 2: Personal Info */}
          <section className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-5">
            <h3 className="font-display text-base font-bold text-[#7A1629] dark:text-[#F3B9C3] border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
              ส่วนที่ 2 ข้อมูลส่วนตัว
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">วันเดือนปีเกิด *</label>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">อายุ *</label>
                <input
                  type="text"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">สัญชาติ *</label>
                <input
                  type="text"
                  value={form.nationality}
                  onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">เชื้อชาติ *</label>
                <input
                  type="text"
                  value={form.ethnicity}
                  onChange={(e) => setForm({ ...form, ethnicity: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">ศาสนา *</label>
                <input
                  type="text"
                  value={form.religion}
                  onChange={(e) => setForm({ ...form, religion: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">Facebook *</label>
                <input
                  type="text"
                  value={form.facebook}
                  onChange={(e) => setForm({ ...form, facebook: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">จำนวนเงินที่ได้รับต่อเดือน (บาท)</label>
                <input
                  type="text"
                  value={form.monthlyAllowance}
                  onChange={(e) => setForm({ ...form, monthlyAllowance: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">ที่อยู่ตามทะเบียนบ้าน *</label>
                <textarea
                  rows={2}
                  value={form.registeredAddress}
                  onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">ที่อยู่ปัจจุบัน *</label>
                <textarea
                  rows={2}
                  value={form.currentAddress}
                  onChange={(e) => setForm({ ...form, currentAddress: e.target.value })}
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Conditional fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#EAE0CE] dark:border-[#343842] text-[#23181A] dark:text-[#F2EFEA]">
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]">มีโรคประจำตัวหรือไม่</span>
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
                    className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]">กู้ยืมเงิน กยศ. หรือไม่</span>
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
                    className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]">ทำงานพิเศษหรือไม่</span>
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
                    className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div className="md:col-span-2 space-y-3 rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE]/60 dark:bg-[#1B1D23] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="block text-xs font-semibold text-[#7A1629] dark:text-[#F3B9C3]">
                      ทุนการศึกษาที่ได้รับ (สามารถเพิ่มได้หลายทุน ไม่จำกัดจำนวน)
                    </span>
                    <p className="text-[11px] text-[#66585B] dark:text-[#A19B91] mt-0.5">
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
                      <p className="rounded-lg border border-dashed border-[#DFD1BA] dark:border-[#434856] bg-white dark:bg-[#22242B] px-3 py-2 text-xs text-[#66585B] dark:text-[#A19B91]">
                        ยังไม่มีรายการทุนการศึกษา กดปุ่ม &quot;เพิ่มทุนการศึกษา&quot; ด้านล่างเพื่อระบุชื่อทุนที่ได้รับ
                      </p>
                    )}
                    {(form.receivedScholarships || []).map((item, idx) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end rounded-xl border border-[#DFD1BA] dark:border-[#343842] bg-white dark:bg-[#22242B] p-3"
                      >
                        <div className="md:col-span-6 space-y-1">
                          <label
                            htmlFor={`scholarship-name-${idx}`}
                            className="block text-[11px] font-medium text-[#23181A] dark:text-[#F2EFEA]"
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
                            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="md:col-span-4 space-y-1">
                          <label
                            htmlFor={`scholarship-provider-${idx}`}
                            className="block text-[11px] font-medium text-[#23181A] dark:text-[#F2EFEA]"
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
                            className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="md:col-span-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveScholarship(idx)}
                            aria-label={`ลบทุนการศึกษา รายการที่ ${idx + 1}${item.name ? ` (${item.name})` : ''}`}
                            className="w-full md:w-auto inline-flex items-center justify-center gap-1 rounded-lg border border-[#FCA5A5] dark:border-red-900/70 bg-[#FEF2F2] dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-[#991B1B] dark:text-red-300 hover:bg-[#FEE2E2] dark:hover:bg-red-950/70 transition-colors"
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
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#C6922C] dark:border-[#E8C97A]/50 bg-[#FDF8EC] dark:bg-[#2B2518] px-4 py-2 text-xs font-semibold text-[#7A1629] dark:text-[#F8E7B8] hover:bg-[#F7EBCB] dark:hover:bg-[#38301E] transition-colors"
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
          <section className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-5">
            <h3 className="font-display text-base font-bold text-[#7A1629] dark:text-[#F3B9C3] border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE]/40 dark:bg-[#1B1D23] p-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]">
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
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
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
                    className="mt-2 w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]">
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
                  className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
                >
                  <option value="อยู่ร่วมกับบิดาและมารดา">อยู่ร่วมกับบิดาและมารดา</option>
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
                    className="mt-2 w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3 py-2 text-sm"
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
              <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                จำนวนสมาชิกในครอบครัว (ไม่รวมนักศึกษา)
              </label>
              <input
                type="text"
                value={form.familyMemberCount}
                onChange={(e) => setForm({ ...form, familyMemberCount: e.target.value })}
                className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </section>

          {/* Part 4: Necessity */}
          <section className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#7A1629] dark:text-[#F3B9C3] border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
              ส่วนที่ 4 ความจำเป็นในการขอรับทุนการศึกษา
            </h3>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                1. อธิบายความจำเป็นในการขอรับทุนการศึกษา
              </label>
              <textarea
                rows={3}
                value={form.necessityReason}
                onChange={(e) => setForm({ ...form, necessityReason: e.target.value })}
                className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#23181A] dark:text-[#F2EFEA]">
                2. แผนการใช้เงินทุนการศึกษา
              </label>
              <textarea
                rows={3}
                value={form.spendingPlan}
                onChange={(e) => setForm({ ...form, spendingPlan: e.target.value })}
                className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] px-3 py-2 text-sm"
              />
            </div>
          </section>

          {/* Part 5: Documents */}
          <section className="rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-5">
            <div className="border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
              <h3 className="font-display text-base font-bold text-[#7A1629] dark:text-[#F3B9C3]">
                ส่วนที่ 5 เอกสารประกอบการขอรับทุน
              </h3>
              <p className="text-xs text-[#66585B] dark:text-[#A19B91] mt-1">
                ขนาดไฟล์ไม่เกิน 3 MB ต่อไฟล์ รองรับ PDF, JPG, PNG และ WEBP (อัปโหลดได้ไม่จำกัดจำนวนไฟล์) หากยังไม่มีภาพถ่าย
                สามารถบันทึกฉบับร่างไว้ก่อนและแนบภายหลังได้
              </p>
            </div>

            <FileUploadField
              label="แนบรูปบ้าน อย่างน้อย 2 รูป (เห็นรูปภายในบริเวณบ้าน และ นอกบ้าน พร้อมผู้ปกครองทุกรูป)"
              helperText="รองรับไฟล์ภาพ JPG, PNG, WEBP หรือ PDF สูงสุด 3 MB ต่อไฟล์"
              files={form.housePhotos}
              onChange={(housePhotos) => {
                const next = { ...form, housePhotos };
                setForm(next);
                void api
                  .saveBasicInfo(next)
                  .then((res) => onUpdated(res.basicInfo))
                  .catch(() => {});
              }}
              maxSizeMB={3}
              allowPdf={true}
              minCount={2}
              studentId={form.studentId || basicInfo.studentId}
            />
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] px-5 py-2.5 text-sm font-medium text-[#23181A] dark:text-[#F2EFEA] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]"
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

      {/* Separate Sub-Window Modal for GPA Entry */}
      <AnimatePresence>
        {showGpaModal && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gpa-modal-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.15, ease: 'easeOut' }}
            style={{ willChange: 'opacity' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowGpaModal(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          >
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4 }}
              transition={{
                duration: prefersReducedMotion ? 0.01 : 0.17,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ willChange: 'transform, opacity' }}
              className="w-full max-w-md rounded-2xl border border-[#D8C6A6] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-5 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
                <h3 id="gpa-modal-title" className="font-display text-lg font-bold text-[#7A1629] dark:text-[#F3B9C3]">
                  หน้าต่างบันทึกเกรดเฉลี่ย
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGpaModal(false)}
                  aria-label="ปิดหน้าต่างเกรดเฉลี่ย"
                  className="rounded-lg p-1 text-[#66585B] dark:text-[#A19B91] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="gpa-gpax" className="block text-sm font-medium text-[#23181A] dark:text-[#F2EFEA]">
                    เกรดเฉลี่ยสะสม (GPAX) *
                  </label>
                  <input
                    id="gpa-gpax"
                    type="text"
                    value={form.gpax}
                    onChange={(e) => setForm({ ...form, gpax: e.target.value })}
                    placeholder="เช่น 3.55"
                    className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3.5 py-2 text-sm tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="gpa-t1" className="block text-sm font-medium text-[#23181A] dark:text-[#F2EFEA]">
                    เกรดเฉลี่ยภาคเรียนที่ 1 ที่ผ่านมา *
                  </label>
                  <input
                    id="gpa-t1"
                    type="text"
                    value={form.gpaTerm1}
                    onChange={(e) => setForm({ ...form, gpaTerm1: e.target.value })}
                    placeholder="เช่น 3.50"
                    className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3.5 py-2 text-sm tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="gpa-t2" className="block text-sm font-medium text-[#23181A] dark:text-[#F2EFEA]">
                    เกรดเฉลี่ยภาคเรียนที่ 2 ที่ผ่านมา *
                  </label>
                  <input
                    id="gpa-t2"
                    type="text"
                    value={form.gpaTerm2}
                    onChange={(e) => setForm({ ...form, gpaTerm2: e.target.value })}
                    placeholder="เช่น 3.60"
                    className="w-full rounded-lg border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] px-3.5 py-2 text-sm tabular-nums"
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDPA Self-Service Account Deletion */}
      {renderSelfDeleteSection()}
      {renderSelfDeleteModal()}
    </div>
  );
}
