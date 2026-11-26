import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  DatabaseBackup,
  ExternalLink,
  FileSpreadsheet,
  FolderPlus,
  HardDrive,
  Link2,
  LogOut,
  PlusCircle,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  api,
  exportStudentsToCsv,
  exportStudentsToExcel,
} from '../services/api';
import {
  googleWorkspaceLogout,
  subscribeGoogleWorkspaceAuth,
} from '../services/googleAuth';
import {
  createDriveFolder,
  createWorkspaceSpreadsheet,
  deleteDriveFile,
  DriveItemInfo,
  inspectDriveFolder,
  inspectSpreadsheet,
  listDriveFolderFiles,
  readStudentsFromGoogleSheet,
  syncStudentsToGoogleSheet,
  uploadFileToGoogleDrive,
} from '../services/googleWorkspace';
import type {
  GoogleWorkspaceConfig,
  ImportStudentsResult,
  StudentFullRecord,
} from '../types/scholarship';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  WorkspaceConfirmDialog,
  WorkspaceConfirmRequest,
} from './WorkspaceConfirmDialog';

interface GoogleWorkspacePanelProps {
  students: StudentFullRecord[];
  currentUserName: string;
  onImportedFromSheet: (result: ImportStudentsResult) => Promise<void> | void;
  onDownloadJsonBackup: () => void;
}

export function GoogleWorkspacePanel({
  students,
  currentUserName,
  onImportedFromSheet,
  onDownloadJsonBackup,
}: GoogleWorkspacePanelProps) {
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleUserName, setGoogleUserName] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [config, setConfig] = useState<GoogleWorkspaceConfig>({});
  const [sheetInput, setSheetInput] = useState('');
  const [folderInput, setFolderInput] = useState('');
  const [sheetTabs, setSheetTabs] = useState<{ sheetId: number; title: string }[]>([]);
  const [selectedImportTab, setSelectedImportTab] = useState('');
  const [driveFiles, setDriveFiles] = useState<DriveItemInfo[]>([]);

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
    const unsub = subscribeGoogleWorkspaceAuth((snap) => {
      setAccessToken(snap.accessToken);
      setGoogleUserEmail(snap.user?.email || null);
      setGoogleUserName(snap.user?.displayName || null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    api
      .getWorkspaceConfig()
      .then((res) => {
        setConfig(res.config || {});
        setSheetInput(res.config?.spreadsheetId || '');
        setFolderInput(res.config?.driveFolderId || '');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setDriveFiles([]);
      return;
    }
    if (config.spreadsheetId) {
      inspectSpreadsheet(accessToken, config.spreadsheetId)
        .then((meta) => {
          setSheetTabs(meta.sheets);
          if (!selectedImportTab && meta.sheets.length > 0) {
            setSelectedImportTab(meta.sheets[0].title);
          }
        })
        .catch(() => {});
    }
    if (config.driveFolderId) {
      listDriveFolderFiles(accessToken, config.driveFolderId)
        .then(setDriveFiles)
        .catch(() => {});
    }
  }, [accessToken, config.spreadsheetId, config.driveFolderId]);

  const persistWorkspaceConfig = async (nextConfig: GoogleWorkspaceConfig) => {
    const res = await api.saveWorkspaceConfig(nextConfig);
    setConfig(res.config);
    setSheetInput(res.config.spreadsheetId || '');
    setFolderInput(res.config.driveFolderId || '');
    return res.config;
  };

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
        text: (err as Error).message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Workspace',
      });
      setConfirmState(null);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSpreadsheet = () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'กรุณาเข้าสู่ระบบด้วย Google ก่อน' });
      return;
    }
    askConfirm(
      {
        title: 'สร้าง Google Sheet ฐานข้อมูลใหม่',
        description:
          'ระบบจะสร้างไฟล์สเปรดชีตใหม่ในบัญชี Google ของคุณ พร้อมแผ่นงานมาตรฐาน 5 แผ่นงานสำหรับจัดเก็บข้อมูลนักศึกษาและทุนการศึกษา',
        details: [
          'ชื่อไฟล์: EDU SOCIAL CARE CMRU — ฐานข้อมูลทุนการศึกษา',
          'แท็บที่สร้าง: นักศึกษาและข้อมูลพื้นฐาน, คำร้องขอทุนการศึกษา, ผลการเรียน_GPA, กิจกรรมจิตอาสา, ข้อมูลนำเข้า_Students',
        ],
        confirmLabel: 'สร้าง Google Sheet',
      },
      async () => {
        const created = await createWorkspaceSpreadsheet(accessToken);
        setSheetTabs(created.sheets);
        await persistWorkspaceConfig({
          ...config,
          spreadsheetId: created.spreadsheetId,
          spreadsheetTitle: created.title,
          spreadsheetUrl: created.spreadsheetUrl,
        });
        setStatusMessage({
          type: 'success',
          text: `สร้างและเชื่อมต่อ Google Sheet "${created.title}" เรียบร้อยแล้ว`,
        });
      }
    );
  };

  const handleConnectExistingSheet = async () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'กรุณาเข้าสู่ระบบด้วย Google ก่อน' });
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    try {
      const meta = await inspectSpreadsheet(accessToken, sheetInput);
      setSheetTabs(meta.sheets);
      if (meta.sheets.length > 0) setSelectedImportTab(meta.sheets[0].title);
      await persistWorkspaceConfig({
        ...config,
        spreadsheetId: meta.spreadsheetId,
        spreadsheetTitle: meta.title,
        spreadsheetUrl: meta.spreadsheetUrl,
      });
      setStatusMessage({
        type: 'success',
        text: `เชื่อมต่อ Google Sheet "${meta.title}" สำเร็จ (${meta.sheets.length} แผ่นงาน)`,
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleSyncToGoogleSheets = () => {
    if (!accessToken || !config.spreadsheetId) {
      setStatusMessage({
        type: 'error',
        text: 'กรุณาเชื่อมต่อบัญชี Google และเลือก Google Sheet ก่อนซิงก์ข้อมูล',
      });
      return;
    }
    const gradeCount = students.reduce((sum, s) => sum + s.grades.length, 0);
    const volCount = students.reduce((sum, s) => sum + s.volunteers.length, 0);
    const appCount = students.filter((s) => Boolean(s.application)).length;

    askConfirm(
      {
        title: 'ยืนยันการอัปเดตข้อมูลไปยัง Google Sheets',
        description: `การดำเนินการนี้จะล้างข้อมูลเดิมในแท็บมาตรฐานของ "${config.spreadsheetTitle || config.spreadsheetId}" และเขียนข้อมูลล่าสุดจากระบบทั้งหมดทับลงไป`,
        details: [
          `นักศึกษาและข้อมูลพื้นฐาน: ${students.length} รายการ`,
          `คำร้องขอทุนการศึกษา: ${appCount} รายการ`,
          `ผลการเรียน (GPA): ${gradeCount} รายการ`,
          `กิจกรรมจิตอาสา: ${volCount} รายการ`,
        ],
        confirmLabel: 'ซิงก์ลง Google Sheets',
        tone: 'warning',
      },
      async () => {
        const res = await syncStudentsToGoogleSheet(
          accessToken,
          config.spreadsheetId!,
          students
        );
        await persistWorkspaceConfig({
          ...config,
          spreadsheetTitle: res.spreadsheetTitle,
          spreadsheetUrl: res.spreadsheetUrl,
          lastSyncedAt: new Date().toISOString(),
          lastSyncedBy: currentUserName,
        });
        setStatusMessage({
          type: 'success',
          text: `ซิงก์ข้อมูลไปยัง Google Sheet สำเร็จ (${res.studentRows} นักศึกษา, ${res.applicationRows} คำร้อง, ${res.gradeRows} ผลการเรียน, ${res.volunteerRows} จิตอาสา)`,
        });
      }
    );
  };

  const handleImportFromGoogleSheets = () => {
    if (!accessToken || !config.spreadsheetId) {
      setStatusMessage({
        type: 'error',
        text: 'กรุณาเชื่อมต่อ Google Sheet ก่อนนำเข้าข้อมูล',
      });
      return;
    }
    askConfirm(
      {
        title: 'นำเข้าข้อมูลนักศึกษาจาก Google Sheets',
        description: `อ่านรายชื่อนักศึกษาจากแท็บ "${selectedImportTab || 'อัตโนมัติ'}" ใน Google Sheet และเพิ่ม/อัปเดตเข้าสู่ระบบ`,
        details: [
          `Google Sheet: ${config.spreadsheetTitle || config.spreadsheetId}`,
          'รหัสนักศึกษาใหม่จะถูกสร้างบัญชีพร้อมรหัสผ่านเริ่มต้นเป็นรหัสนักศึกษา 8 หลัก',
        ],
        confirmLabel: 'นำเข้าข้อมูลจาก Sheets',
      },
      async () => {
        const sheetRead = await readStudentsFromGoogleSheet(
          accessToken,
          config.spreadsheetId!,
          selectedImportTab || undefined
        );
        if (sheetRead.validRows.length === 0) {
          throw new Error(
            sheetRead.errors[0] || `ไม่พบข้อมูลนักศึกษาที่ถูกต้องในแท็บ "${sheetRead.tabTitle}"`
          );
        }
        const importRes = await api.importStudentsExcel(sheetRead.validRows);
        await onImportedFromSheet(importRes.result);
        setStatusMessage({
          type: 'success',
          text: `นำเข้าจากแท็บ "${sheetRead.tabTitle}" สำเร็จ: เพิ่มใหม่ ${importRes.result.createdCount} คน, อัปเดต ${importRes.result.updatedCount} คน`,
        });
      }
    );
  };

  const handleCreateDriveFolder = () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'กรุณาเข้าสู่ระบบด้วย Google ก่อน' });
      return;
    }
    askConfirm(
      {
        title: 'สร้างโฟลเดอร์ใหม่ใน Google Drive',
        description:
          'สร้างโฟลเดอร์สำหรับเก็บภาพถ่ายนักศึกษา ภาพบ้าน/ครอบครัว ใบเกรด PDF และภาพกิจกรรมจิตอาสาทั้งหมดบน Google Drive',
        details: ['ชื่อโฟลเดอร์: EDU SOCIAL CARE CMRU — เอกสารและรูปภาพทุนการศึกษา'],
        confirmLabel: 'สร้างโฟลเดอร์ Google Drive',
      },
      async () => {
        const folder = await createDriveFolder(accessToken);
        await persistWorkspaceConfig({
          ...config,
          driveFolderId: folder.id,
          driveFolderName: folder.name,
          driveFolderUrl:
            folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
        });
        const files = await listDriveFolderFiles(accessToken, folder.id);
        setDriveFiles(files);
        setStatusMessage({
          type: 'success',
          text: `สร้างและเชื่อมต่อโฟลเดอร์ Google Drive "${folder.name}" เรียบร้อยแล้ว`,
        });
      }
    );
  };

  const handleConnectExistingFolder = async () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'กรุณาเข้าสู่ระบบด้วย Google ก่อน' });
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    try {
      const folder = await inspectDriveFolder(accessToken, folderInput);
      await persistWorkspaceConfig({
        ...config,
        driveFolderId: folder.id,
        driveFolderName: folder.name,
        driveFolderUrl:
          folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
      });
      const files = await listDriveFolderFiles(accessToken, folder.id);
      setDriveFiles(files);
      setStatusMessage({
        type: 'success',
        text: `เชื่อมต่อโฟลเดอร์ Google Drive "${folder.name}" สำเร็จ`,
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshDriveFiles = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const files = await listDriveFolderFiles(accessToken, config.driveFolderId);
      setDriveFiles(files);
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleDirectDriveUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !accessToken) return;

    askConfirm(
      {
        title: 'อัปโหลดไฟล์ไปยัง Google Drive',
        description: `ยืนยันการอัปโหลดไฟล์ไปยังโฟลเดอร์ "${config.driveFolderName || 'Google Drive หลัก'}"`,
        details: [
          `ชื่อไฟล์: ${file.name}`,
          `ขนาดไฟล์: ${(file.size / 1024).toFixed(1)} KB`,
        ],
        confirmLabel: 'อัปโหลดขึ้น Google Drive',
      },
      async () => {
        await uploadFileToGoogleDrive(accessToken, file, {
          folderId: config.driveFolderId,
        });
        const files = await listDriveFolderFiles(accessToken, config.driveFolderId);
        setDriveFiles(files);
        setStatusMessage({
          type: 'success',
          text: `อัปโหลดไฟล์ "${file.name}" ลง Google Drive เรียบร้อยแล้ว`,
        });
      }
    );
  };

  const handleDeleteDriveFile = (item: DriveItemInfo) => {
    if (!accessToken) return;
    askConfirm(
      {
        title: 'ยืนยันการลบไฟล์จาก Google Drive',
        description:
          'ไฟล์นี้จะถูกลบออกจาก Google Drive อย่างถาวรและไม่สามารถกู้คืนได้ กรุณาตรวจสอบให้แน่ใจก่อนยืนยัน',
        details: [`ชื่อไฟล์: ${item.name}`, `Drive File ID: ${item.id}`],
        confirmLabel: 'ลบออกจาก Google Drive',
        tone: 'danger',
      },
      async () => {
        await deleteDriveFile(accessToken, item.id);
        setDriveFiles((prev) => prev.filter((f) => f.id !== item.id));
        setStatusMessage({
          type: 'success',
          text: `ลบไฟล์ "${item.name}" ออกจาก Google Drive แล้ว`,
        });
      }
    );
  };

  return (
    <div className="no-print space-y-6">
      {/* Header & Google Auth Connection Bar */}
      <section className="rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EAE0CE] pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7A1629]/10 text-[#7A1629]">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#7A1629]">
                ศูนย์จัดการฐานข้อมูล Google Sheets &amp; ที่เก็บไฟล์ Google Drive
              </h2>
              <p className="text-xs text-[#66585B] mt-0.5">
                เชื่อมต่อบัญชี Google เพื่อเก็บข้อมูลนักศึกษา ใบสมัคร ผลการเรียน จิตอาสา ใน Google Sheets และจัดเก็บภาพ/PDF ใน Google Drive
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {accessToken ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#86EFAC] bg-[#F0FDF4] px-3 py-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#16A34A]" aria-hidden="true" />
                <div className="text-xs">
                  <span className="font-semibold text-[#166534]">
                    {googleUserName || 'เชื่อมต่อ Google แล้ว'}
                  </span>
                  {googleUserEmail && (
                    <span className="ml-1.5 text-[#15803D]">({googleUserEmail})</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => googleWorkspaceLogout()}
                  className="ml-2 inline-flex items-center gap-1 rounded-lg border border-[#BBF7D0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#166534] hover:bg-[#DCFCE7] transition-colors"
                >
                  <LogOut className="h-3 w-3" aria-hidden="true" />
                  <span>ออกจาก Google</span>
                </button>
              </div>
            ) : (
              <GoogleSignInButton
                label="Sign in with Google"
                onError={(msg) => setStatusMessage({ type: 'error', text: msg })}
              />
            )}
          </div>
        </div>

        {!accessToken && (
          <div className="rounded-xl border border-[#E5C98E] bg-[#FDF8EC] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#5C410A]">
                ยังไม่ได้เชื่อมต่อบัญชี Google สำหรับ Google Sheets &amp; Google Drive
              </p>
              <p className="text-xs text-[#7B5A12]">
                กดปุ่ม &ldquo;Sign in with Google&rdquo; เพื่ออนุญาตให้แอปสร้าง/อัปเดตฐานข้อมูล Google Sheets และอัปโหลดรูปภาพ/ไฟล์ลง Google Drive โดยได้รับอนุญาตจากผู้ใช้งาน
              </p>
            </div>
            <GoogleSignInButton
              label="Sign in with Google"
              onError={(msg) => setStatusMessage({ type: 'error', text: msg })}
            />
          </div>
        )}

        {statusMessage && (
          <div
            role={statusMessage.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border px-4 py-3 text-sm ${
              statusMessage.type === 'error'
                ? 'border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#86EFAC] bg-[#F0FDF4] text-[#166534]'
            }`}
          >
            {statusMessage.text}
          </div>
        )}
      </section>

      {/* Grid: Google Sheets + Google Drive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Sheets Card */}
        <section className="rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
          <div className="flex items-center justify-between gap-3 border-b border-[#EAE0CE] pb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#166534]" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-[#23181A]">
                1. ฐานข้อมูล Google Sheets
              </h3>
            </div>
            {config.spreadsheetUrl && (
              <a
                href={config.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline"
              >
                <span>เปิด Google Sheet</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] p-3.5 text-xs space-y-1">
              <p className="text-[#66585B]">ไฟล์ Google Sheet ที่เชื่อมต่ออยู่:</p>
              <p className="font-semibold text-[#23181A]">
                {config.spreadsheetTitle || (config.spreadsheetId ? config.spreadsheetId : 'ยังไม่ได้เชื่อมต่อ')}
              </p>
              {config.lastSyncedAt && (
                <p className="text-[11px] text-[#66585B]">
                  ซิงก์ล่าสุด: {new Date(config.lastSyncedAt).toLocaleString('th-TH')} โดย{' '}
                  {config.lastSyncedBy || '-'}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="gsheet-id-input"
                className="block text-xs font-semibold text-[#23181A]"
              >
                ระบุลิงก์หรือ Spreadsheet ID ที่มีอยู่แล้ว
              </label>
              <div className="flex gap-2">
                <input
                  id="gsheet-id-input"
                  type="text"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-xs text-[#23181A] focus:border-[#7A1629] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleConnectExistingSheet}
                  disabled={!accessToken || busy || !sheetInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-xs font-semibold text-[#23181A] hover:bg-[#EFE5D1] disabled:opacity-50"
                >
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>เชื่อมต่อ</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleCreateSpreadsheet}
                disabled={!accessToken || busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#166534] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#14532D] transition-colors disabled:opacity-50"
              >
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>สร้าง Google Sheet ฐานข้อมูลใหม่</span>
              </button>

              <button
                type="button"
                onClick={handleSyncToGoogleSheets}
                disabled={!accessToken || !config.spreadsheetId || busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A1629] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#5E1020] transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>ซิงก์ข้อมูลทั้งหมดลง Sheets ({students.length} คน)</span>
              </button>
            </div>

            {config.spreadsheetId && sheetTabs.length > 0 && (
              <div className="border-t border-[#EAE0CE] pt-3 space-y-2">
                <label
                  htmlFor="gsheet-import-tab"
                  className="block text-xs font-semibold text-[#23181A]"
                >
                  นำเข้ารายชื่อนักศึกษาจากแผ่นงาน (Tab) ใน Google Sheet
                </label>
                <div className="flex flex-wrap gap-2">
                  <select
                    id="gsheet-import-tab"
                    value={selectedImportTab}
                    onChange={(e) => setSelectedImportTab(e.target.value)}
                    className="flex-1 min-w-[160px] rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-xs text-[#23181A]"
                  >
                    {sheetTabs.map((tab) => (
                      <option key={tab.sheetId} value={tab.title}>
                        {tab.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleImportFromGoogleSheets}
                    disabled={!accessToken || busy}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] bg-white px-3.5 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#FAF6EE] disabled:opacity-50"
                  >
                    <span>นำเข้าจากแผ่นงานนี้</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Google Drive Card */}
        <section className="rounded-2xl border border-[#DFD1BA] bg-white p-6 space-y-4 surface-card">
          <div className="flex items-center justify-between gap-3 border-b border-[#EAE0CE] pb-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-[#1D4ED8]" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-[#23181A]">
                2. ที่เก็บภาพและไฟล์แนบ Google Drive
              </h3>
            </div>
            {config.driveFolderUrl && (
              <a
                href={config.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
              >
                <span>เปิดโฟลเดอร์ Drive</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] p-3.5 text-xs space-y-1">
              <p className="text-[#66585B]">โฟลเดอร์ Google Drive ที่ใช้งานอยู่:</p>
              <p className="font-semibold text-[#23181A]">
                {config.driveFolderName ||
                  (config.driveFolderId ? config.driveFolderId : 'ยังไม่ได้เลือกโฟลเดอร์ (สร้างหรือเชื่อมต่อด้านล่าง)')}
              </p>
              <p className="text-[11px] text-[#66585B]">
                ไฟล์ที่อัปโหลดผ่านแบบฟอร์มนักศึกษา ใบเกรด และภาพกิจกรรมจิตอาสา จะถูกบันทึกเข้าสู่โฟลเดอร์นี้เมื่อผู้ใช้เชื่อมต่อ Google
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="gdrive-folder-input"
                className="block text-xs font-semibold text-[#23181A]"
              >
                ระบุลิงก์โฟลเดอร์ Google Drive หรือ Folder ID
              </label>
              <div className="flex gap-2">
                <input
                  id="gdrive-folder-input"
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-xs text-[#23181A] focus:border-[#7A1629] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleConnectExistingFolder}
                  disabled={!accessToken || busy || !folderInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-3 py-2 text-xs font-semibold text-[#23181A] hover:bg-[#EFE5D1] disabled:opacity-50"
                >
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>เชื่อมต่อ</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleCreateDriveFolder}
                disabled={!accessToken || busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1D4ED8] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] transition-colors disabled:opacity-50"
              >
                <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>สร้างโฟลเดอร์ Google Drive ใหม่</span>
              </button>

              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#C6922C]/60 bg-[#FAF6EE] px-3.5 py-2 text-xs font-semibold text-[#7A1629] hover:bg-[#EFE5D1] transition-colors ${
                  !accessToken || busy ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>อัปโหลดไฟล์ทดสอบลง Drive</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  onChange={handleDirectDriveUpload}
                  className="sr-only"
                />
              </label>

              <button
                type="button"
                onClick={handleRefreshDriveFiles}
                disabled={!accessToken || busy}
                className="inline-flex items-center gap-1 rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-xs font-medium text-[#5A4B4E] hover:bg-[#FAF6EE] disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>รีเฟรชรายการ</span>
              </button>
            </div>

            {/* File list inside Drive */}
            <div className="border-t border-[#EAE0CE] pt-3 space-y-2">
              <p className="text-xs font-semibold text-[#23181A]">
                ไฟล์และรูปภาพในโฟลเดอร์ Google Drive ({driveFiles.length})
              </p>
              {driveFiles.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#D8CBB8] bg-[#FAF6EE] p-4 text-center text-xs text-[#66585B]">
                  {accessToken
                    ? 'ยังไม่มีไฟล์ที่อัปโหลดในโฟลเดอร์นี้'
                    : 'เข้าสู่ระบบด้วย Google เพื่อดูรายการไฟล์ในโฟลเดอร์ Google Drive'}
                </p>
              ) : (
                <div className="max-h-60 overflow-auto divide-y divide-[#F0E8D8] rounded-xl border border-[#EAE0CE]">
                  {driveFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white"
                    >
                      <div className="min-w-0 flex-1">
                        <a
                          href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-[#23181A] hover:text-[#7A1629] hover:underline truncate block"
                        >
                          {f.name}
                        </a>
                        <p className="text-[11px] text-[#66585B] tabular-nums">
                          {f.size ? `${(Number(f.size) / 1024).toFixed(0)} KB · ` : ''}
                          {f.modifiedTime
                            ? new Date(f.modifiedTime).toLocaleDateString('th-TH')
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteDriveFile(f)}
                        disabled={busy}
                        aria-label={`ลบไฟล์ ${f.name} ออกจาก Google Drive`}
                        className="rounded-lg p-1.5 text-[#66585B] hover:bg-[#FEE2E2] hover:text-[#B91C1C] transition-colors shrink-0"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Export & JSON Backup strip */}
      <section className="rounded-2xl border border-[#DFD1BA] bg-white p-5 flex flex-wrap items-center justify-between gap-4 surface-card">
        <div>
          <h3 className="font-display text-sm font-bold text-[#23181A]">
            ส่งออกรายงานสำรองเพิ่มเติม (Excel / CSV / JSON)
          </h3>
          <p className="text-xs text-[#66585B]">
            ดาวน์โหลดข้อมูลทั้งหมดเก็บเป็นไฟล์สำรองออฟไลน์นอกเหนือจาก Google Sheets
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportStudentsToExcel(students)}
            className="rounded-xl bg-[#166534] px-4 py-2 text-xs font-medium text-white hover:bg-[#14532D] transition-colors"
          >
            ดาวน์โหลด Excel ทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => exportStudentsToCsv(students)}
            className="rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] px-4 py-2 text-xs font-medium text-[#23181A] hover:bg-[#EFE5D1] transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
          <button
            type="button"
            onClick={onDownloadJsonBackup}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] bg-white px-4 py-2 text-xs font-medium text-[#7A1629] hover:bg-[#FAF6EE] transition-colors"
          >
            <DatabaseBackup className="h-3.5 w-3.5" aria-hidden="true" />
            <span>สำรองข้อมูล (JSON)</span>
          </button>
        </div>
      </section>

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
