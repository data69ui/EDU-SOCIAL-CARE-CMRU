import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  DatabaseBackup,
  ExternalLink,
  FileSpreadsheet,
  HardDrive,
  Link2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  api,
  exportStudentsToCsv,
  exportStudentsToExcel,
} from '../services/api';
import { getCachedDatabaseState } from '../services/googleSheetsDb';
import type {
  GoogleWorkspaceConfig,
  ImportStudentsResult,
  StudentFullRecord,
  SystemSnapshotPayload,
} from '../types/scholarship';
import { useSaveSuccess } from '../contexts/SaveSuccessContext';
import {
  WorkspaceConfirmDialog,
  WorkspaceConfirmRequest,
} from './WorkspaceConfirmDialog';

interface GoogleWorkspacePanelProps {
  students: StudentFullRecord[];
  currentUserName: string;
  isAdmin?: boolean;
  onImportedFromSheet?: (result: ImportStudentsResult) => Promise<void> | void;
  onRestoredSnapshot?: () => Promise<void> | void;
  onDownloadJsonBackup: () => void;
}

function extractSheetIdFromInput(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/);
  return match?.[1] || trimmed;
}

function extractFolderIdFromInput(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  return match?.[1] || trimmed;
}

export function GoogleWorkspacePanel({
  students,
  currentUserName,
  isAdmin = false,
  onRestoredSnapshot,
  onDownloadJsonBackup,
}: GoogleWorkspacePanelProps) {
  const { showSaveSuccess } = useSaveSuccess();
  const [config, setConfig] = useState<GoogleWorkspaceConfig>({});
  const [sheetInput, setSheetInput] = useState('');
  const [folderInput, setFolderInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    request: WorkspaceConfirmRequest;
    action: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    api
      .getWorkspaceConfig()
      .then((res) => {
        setConfig(res.config || {});
        setSheetInput(res.config?.spreadsheetUrl || res.config?.spreadsheetId || '');
        setFolderInput(res.config?.driveFolderUrl || res.config?.driveFolderId || '');
      })
      .catch(() => {});
  }, []);

  const cachedDb = getCachedDatabaseState();
  const adminCount = cachedDb?.admins.length ?? 0;
  const userCount = cachedDb?.users.length ?? 0;
  const gradeCount = students.reduce((sum, s) => sum + s.grades.length, 0);
  const volCount = students.reduce((sum, s) => sum + s.volunteers.length, 0);
  const appCount = students.filter((s) => Boolean(s.application)).length;

  const askConfirm = (request: WorkspaceConfirmRequest, action: () => Promise<void>) => {
    setConfirmState({ request, action });
  };

  const handleConfirmExecute = async () => {
    if (!confirmState) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: (err as Error).message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets / Drive',
      });
      setConfirmState(null);
    } finally {
      setBusy(false);
    }
  };

  const handleReloadFromSheets = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const fresh = await api.loadAllDatabase(true);
      setConfig(fresh.workspaceConfig || {});
      setSheetInput(fresh.workspaceConfig?.spreadsheetUrl || fresh.workspaceConfig?.spreadsheetId || '');
      setFolderInput(fresh.workspaceConfig?.driveFolderUrl || fresh.workspaceConfig?.driveFolderId || '');
      if (onRestoredSnapshot) await onRestoredSnapshot();
      const msg = `โหลดข้อมูลทั้งหมดจาก Google Sheets สำเร็จ (${fresh.students.length} นักศึกษา, ไม่จำกัดจำนวนรายการ)`;
      setStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'ซิงก์ข้อมูลล่าสุดจากฐานข้อมูลเรียบร้อย');
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleSyncAllTables = () => {
    askConfirm(
      {
        title: 'ยืนยันการซิงก์ข้อมูลทุกตารางลง Google Sheets',
        description:
          'ระบบจะส่งข้อมูลล่าสุดทุกตาราง (Admins, Users, Students, Scholarships, Applications, VolunteerLogs, Grades, Settings) ไปยัง Google Sheets ครบทั้งหมด',
        details: [
          `นักศึกษา (Students): ${students.length} รายการ`,
          `ใบสมัครทุน (Applications): ${appCount} รายการ`,
          `ผลการเรียน (Grades): ${gradeCount} รายการ`,
          `จิตอาสา (VolunteerLogs): ${volCount} รายการ`,
        ],
        confirmLabel: 'ซิงก์ทุกตารางทันที',
      },
      async () => {
        const res = await api.syncAllTablesToSheets();
        const cfgRes = await api.getWorkspaceConfig().catch(() => null);
        if (cfgRes?.config) setConfig(cfgRes.config);
        const msg = `ซิงก์ทุกตารางลง Google Sheets สำเร็จ (${res.students} นักศึกษา, ${res.applications} คำร้อง, ${res.grades} เกรด, ${res.volunteers} จิตอาสา)`;
        setStatusMessage({ type: 'success', text: msg });
        showSaveSuccess(msg, 'บันทึกข้อมูลทุกตารางลง Google Sheets เสร็จสิ้น');
      }
    );
  };

  const handleSaveReferenceLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusMessage(null);
    try {
      const spreadsheetId = sheetInput.trim() ? extractSheetIdFromInput(sheetInput) : undefined;
      const driveFolderId = folderInput.trim() ? extractFolderIdFromInput(folderInput) : undefined;
      const res = await api.saveWorkspaceConfig({
        ...config,
        spreadsheetId,
        spreadsheetUrl: sheetInput.trim().startsWith('https://')
          ? sheetInput.trim()
          : spreadsheetId
            ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
            : undefined,
        driveFolderId,
        driveFolderUrl: folderInput.trim().startsWith('https://')
          ? folderInput.trim()
          : driveFolderId
            ? `https://drive.google.com/drive/folders/${driveFolderId}`
            : undefined,
      });
      setConfig(res.config);
      const msg = 'บันทึกลิงก์อ้างอิง Google Sheet และโฟลเดอร์ Google Drive ลงตาราง Settings สำเร็จ';
      setStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'บันทึกการตั้งค่าเสร็จสิ้น');
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFromLocalJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SystemSnapshotPayload;
      if (!parsed || !Array.isArray(parsed.students)) {
        throw new Error('ไฟล์ JSON นี้ไม่ใช่ไฟล์สำรองข้อมูลของระบบ EDU SOCIAL CARE CMRU');
      }
      askConfirm(
        {
          title: 'กู้คืนข้อมูลทั้งระบบลง Google Sheets',
          description:
            'ระบบจะนำข้อมูลนักศึกษา ใบสมัคร ผลการเรียน ชั่วโมงจิตอาสา และการตั้งค่าจากไฟล์สำรองนี้ซิงก์เข้าสู่ Google Sheets ทันที',
          details: [
            `ชื่อไฟล์: ${file.name}`,
            `จำนวนนักศึกษาในไฟล์: ${parsed.students.length} คน`,
          ],
          confirmLabel: 'ยืนยันกู้คืนข้อมูล',
          tone: 'warning',
        },
        async () => {
          const res = await api.restoreSnapshot(parsed);
          if (onRestoredSnapshot) await onRestoredSnapshot();
          const cfgRes = await api.getWorkspaceConfig().catch(() => null);
          if (cfgRes?.config) setConfig(cfgRes.config);
          const localRestoreMsg = `กู้คืนข้อมูลสำเร็จ: นักศึกษา ${res.result.restoredStudents} คน, ใบสมัคร ${res.result.restoredApplications} ฉบับ, ผลการเรียน ${res.result.restoredGrades} รายการ, จิตอาสา ${res.result.restoredVolunteers} รายการ`;
          setStatusMessage({ type: 'success', text: localRestoreMsg });
          showSaveSuccess(localRestoreMsg, 'กู้คืนและซิงก์ข้อมูลลง Google Sheets เสร็จสิ้น');
        }
      );
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    }
  };

  return (
    <div className="no-print space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-[#DFD1BA] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-4 surface-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EAE0CE] dark:border-[#343842] pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#166534]/10 dark:bg-emerald-950/60 text-[#166534] dark:text-[#4ADE80]">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#7A1629] dark:text-[#F4D98A]">
                ศูนย์จัดการฐานข้อมูล Google Sheets &amp; Google Drive
              </h2>
              <p className="text-xs text-[#66585B] dark:text-[#A19B91] mt-0.5">
                เชื่อมต่อฐานข้อมูลและไฟล์แนบทั้งหมดเข้ากับ Google Sheets และ Google Drive แบบเรียลไทม์ ไม่จำกัดจำนวนรายการ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#86EFAC] dark:border-[#166534] bg-[#F0FDF4] dark:bg-[#143322] px-3 py-1.5 text-xs font-semibold text-[#166534] dark:text-[#86EFAC]">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>เชื่อมต่อ Google Sheets &amp; Drive API พร้อมใช้งาน</span>
            </span>
          </div>
        </div>

        {/* Live Table Counts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Admins', count: adminCount },
            { label: 'Users (อาจารย์)', count: userCount },
            { label: 'Students', count: students.length },
            { label: 'Applications', count: appCount },
            { label: 'Grades', count: gradeCount },
            { label: 'VolunteerLogs', count: volCount },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1A1C21] px-3.5 py-2.5"
            >
              <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">{item.label}</p>
              <p className="font-display text-xl font-bold text-[#7A1629] dark:text-[#F4D98A] tabular-nums">
                {item.count}
              </p>
            </div>
          ))}
        </div>

        {config.lastSyncedAt && (
          <p className="text-xs text-[#66585B] dark:text-[#A19B91]">
            ซิงก์ข้อมูลล่าสุด: {new Date(config.lastSyncedAt).toLocaleString('th-TH')} โดย{' '}
            {config.lastSyncedBy || currentUserName}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={handleReloadFromSheets}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] dark:border-[#C6922C] bg-white dark:bg-[#1A1C21] px-4 py-2 text-xs font-semibold text-[#7A1629] dark:text-[#F4D98A] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>โหลดข้อมูลล่าสุดจาก Google Sheets</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleSyncAllTables}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E1020] disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>ซิงก์ทุกตารางลง Google Sheets ทันที</span>
          </button>
        </div>

        {statusMessage && (
          <div
            role={statusMessage.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border px-4 py-3 text-sm ${
              statusMessage.type === 'error'
                ? 'border-[#FCA5A5] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2F1519] text-[#991B1B] dark:text-[#FCA5A5]'
                : 'border-[#86EFAC] dark:border-[#166534] bg-[#F0FDF4] dark:bg-[#143322] text-[#166534] dark:text-[#86EFAC]'
            }`}
          >
            {statusMessage.text}
          </div>
        )}
      </section>

      {/* Reference URLs + Export/Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-[#DFD1BA] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-4 surface-card">
          <div className="flex items-center justify-between gap-3 border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-[#1D4ED8] dark:text-[#60A5FA]" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-[#23181A] dark:text-[#F2EFEA]">
                ลิงก์อ้างอิง Google Sheet &amp; โฟลเดอร์ Google Drive
              </h3>
            </div>
          </div>

          <form onSubmit={handleSaveReferenceLinks} className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="gsheet-ref-input"
                className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]"
              >
                URL หรือ ID ของ Google Sheet ฐานข้อมูล
              </label>
              <div className="flex gap-2">
                <input
                  id="gsheet-ref-input"
                  type="text"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] px-3 py-2 text-xs text-[#23181A] dark:text-[#F2EFEA]"
                />
                {config.spreadsheetUrl && (
                  <a
                    href={config.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#2B2F3A] px-3 py-2 text-xs font-semibold text-[#166534] dark:text-[#4ADE80]"
                  >
                    <span>เปิด</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="gdrive-ref-input"
                className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]"
              >
                URL หรือ ID ของโฟลเดอร์ Google Drive
              </label>
              <div className="flex gap-2">
                <input
                  id="gdrive-ref-input"
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] px-3 py-2 text-xs text-[#23181A] dark:text-[#F2EFEA]"
                />
                {config.driveFolderUrl && (
                  <a
                    href={config.driveFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#2B2F3A] px-3 py-2 text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]"
                  >
                    <span>เปิด</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#166534] px-4 py-2 text-xs font-semibold text-white hover:bg-[#14532D] disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>บันทึกลิงก์ลงตาราง Settings</span>
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-[#DFD1BA] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-4 surface-card">
          <div className="flex items-center gap-2 border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
            <DatabaseBackup className="h-5 w-5 text-[#7A1629] dark:text-[#E8C97A]" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-[#23181A] dark:text-[#F2EFEA]">
              ส่งออกข้อมูลและสำรองฐานข้อมูล (Backup / Restore)
            </h3>
          </div>

          <p className="text-xs text-[#66585B] dark:text-[#A19B91] leading-relaxed">
            ดาวน์โหลดข้อมูลนักศึกษาเป็นไฟล์ Excel (.xlsx), CSV หรือ JSON Snapshot เพื่อเก็บสำรองภายนอก
            {isAdmin ? ' และสามารถนำเข้าไฟล์ JSON Snapshot เพื่อกู้คืนข้อมูลลง Google Sheets ได้' : ''}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportStudentsToExcel(students)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] px-3.5 py-2 text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA] hover:bg-[#EFE5D1] dark:hover:bg-[#2B2F3A]"
            >
              ส่งออก Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => exportStudentsToCsv(students)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] px-3.5 py-2 text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA] hover:bg-[#EFE5D1] dark:hover:bg-[#2B2F3A]"
            >
              ส่งออก CSV
            </button>
            <button
              type="button"
              onClick={onDownloadJsonBackup}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#C6922C] dark:border-[#E8C97A]/60 bg-[#FDF8EC] dark:bg-[#2D2414] px-3.5 py-2 text-xs font-semibold text-[#7A1629] dark:text-[#F4D98A] hover:bg-[#F7EBCB] dark:hover:bg-[#3A2E19]"
            >
              ดาวน์โหลด JSON Backup
            </button>
            {isAdmin && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#7A1629] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#5E1020]">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>กู้คืนจากไฟล์ JSON</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFromLocalJson}
                  className="sr-only"
                />
              </label>
            )}
          </div>
        </section>
      </div>

      <WorkspaceConfirmDialog
        request={confirmState?.request || null}
        busy={busy}
        onConfirm={handleConfirmExecute}
        onCancel={() => {
          if (!busy) setConfirmState(null);
        }}
      />
    </div>
  );
}
