import { useEffect, useId, useState } from 'react';
import { HardDrive, Trash2, Upload } from 'lucide-react';
import { api } from '../services/api';
import { subscribeGoogleWorkspaceAuth } from '../services/googleAuth';
import {
  deleteDriveFile,
  uploadFileToGoogleDrive,
} from '../services/googleWorkspace';
import type { GoogleWorkspaceConfig, UploadedFileMeta } from '../types/scholarship';
import { validateUploadFile } from '../utils/scholarshipLogic';
import { DriveFileLink, DriveImage } from './DriveMedia';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  WorkspaceConfirmDialog,
  WorkspaceConfirmRequest,
} from './WorkspaceConfirmDialog';

interface FileUploadFieldProps {
  label: string;
  helperText: string;
  files: UploadedFileMeta[];
  onChange: (nextFiles: UploadedFileMeta[]) => void;
  maxSizeMB: number;
  allowPdf: boolean;
  multiple?: boolean;
  minCount?: number;
  maxCount?: number;
}

export function FileUploadField({
  label,
  helperText,
  files,
  onChange,
  maxSizeMB,
  allowPdf,
  multiple = true,
  minCount,
  maxCount,
}: FileUploadFieldProps) {
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [workspaceConfig, setWorkspaceConfig] = useState<GoogleWorkspaceConfig>({});
  const [pendingConfirm, setPendingConfirm] = useState<{
    request: WorkspaceConfirmRequest;
    action: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeGoogleWorkspaceAuth((snap) => {
      setAccessToken(snap.accessToken);
    });
    api
      .getWorkspaceConfig()
      .then((res) => setWorkspaceConfig(res.config || {}))
      .catch(() => {});
    return unsub;
  }, []);

  const accept = allowPdf
    ? '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'
    : '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

  const applyUploadedFiles = (uploaded: UploadedFileMeta[]) => {
    if (!multiple) {
      onChange(uploaded.slice(0, 1));
    } else {
      const combined = [...files, ...uploaded];
      onChange(maxCount ? combined.slice(0, maxCount) : combined);
    }
  };

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (selected.length === 0) return;

    setError(null);
    for (const file of selected) {
      const check = validateUploadFile(
        { name: file.name, size: file.size, type: file.type },
        { maxSizeMB, allowPdf }
      );
      if (!check.valid) {
        setError(check.error || 'ไฟล์ไม่ผ่านเงื่อนไข');
        return;
      }
    }

    if (accessToken) {
      setPendingConfirm({
        request: {
          title: 'อัปโหลดไฟล์ไปยัง Google Drive',
          description: `ยืนยันการอัปโหลด ${selected.length} ไฟล์เข้าสู่ Google Drive${
            workspaceConfig.driveFolderName
              ? ` ในโฟลเดอร์ "${workspaceConfig.driveFolderName}"`
              : ''
          }`,
          details: selected.map(
            (f) => `${f.name} (${(f.size / 1024).toFixed(0)} KB)`
          ),
          confirmLabel: 'อัปโหลดลง Google Drive',
        },
        action: async () => {
          const uploaded: UploadedFileMeta[] = [];
          for (const file of selected) {
            const meta = await uploadFileToGoogleDrive(accessToken, file, {
              folderId: workspaceConfig.driveFolderId,
              maxSizeMB,
              allowPdf,
            });
            uploaded.push(meta);
          }
          applyUploadedFiles(uploaded);
        },
      });
      return;
    }

    // Fallback when user has not signed in to Google Drive yet
    setUploading(true);
    try {
      const uploaded: UploadedFileMeta[] = [];
      for (const file of selected) {
        const meta = await api.uploadFile(file);
        uploaded.push(meta);
      }
      applyUploadedFiles(uploaded);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (file: UploadedFileMeta) => {
    if (file.driveFileId && accessToken) {
      setPendingConfirm({
        request: {
          title: 'ยืนยันการลบไฟล์จาก Google Drive',
          description:
            'ไฟล์นี้จัดเก็บอยู่บน Google Drive ของคุณ ต้องการลบไฟล์นี้ออกจาก Google Drive ด้วยหรือไม่?',
          details: [`ชื่อไฟล์: ${file.name}`],
          confirmLabel: 'ลบออกจาก Google Drive',
          tone: 'danger',
        },
        action: async () => {
          await deleteDriveFile(accessToken, file.driveFileId!);
          onChange(files.filter((f) => f.id !== file.id));
        },
      });
      return;
    }
    onChange(files.filter((f) => f.id !== file.id));
  };

  const runPendingConfirm = async () => {
    if (!pendingConfirm) return;
    setUploading(true);
    setError(null);
    try {
      await pendingConfirm.action();
      setPendingConfirm(null);
    } catch (err) {
      setError((err as Error).message);
      setPendingConfirm(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-[#23181A] dark:text-[#F2EFEA]">
          {label}
        </label>
        <span className="text-xs text-[#66585B] dark:text-[#A19B91] tabular-nums">
          แนบแล้ว {files.length} ไฟล์
          {minCount ? ` · ขั้นต่ำ ${minCount} ไฟล์` : ''}
          {` · สูงสุด ${maxSizeMB} MB/ไฟล์`}
        </span>
      </div>

      <p className="text-xs text-[#66585B] dark:text-[#A19B91]">{helperText}</p>

      <div className="flex flex-wrap items-center gap-2.5">
        <label
          htmlFor={inputId}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#C6922C]/60 dark:border-[#E8C97A]/50 bg-[#FAF6EE] dark:bg-[#1B1D23] px-4 py-2 text-xs font-medium text-[#7A1629] dark:text-[#F8E7B8] transition-colors hover:bg-[#F1E6D0] dark:hover:bg-[#2B2F3A] ${
            uploading ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {uploading
              ? 'กำลังอัปโหลด...'
              : accessToken
                ? 'เลือกไฟล์อัปโหลดลง Google Drive'
                : 'เลือกไฟล์อัปโหลด'}
          </span>
        </label>
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleSelectFiles}
          className="sr-only"
        />

        {accessToken ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#BBF7D0] dark:border-emerald-900/70 bg-[#F0FDF4] dark:bg-emerald-950/50 px-2.5 py-1.5 text-[11px] font-medium text-[#166534] dark:text-emerald-300">
            <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              เก็บใน Google Drive
              {workspaceConfig.driveFolderName ? ` (${workspaceConfig.driveFolderName})` : ''}
            </span>
          </span>
        ) : (
          <GoogleSignInButton
            label="Sign in with Google เพื่อเก็บใน Drive"
            onError={(msg) => setError(msg)}
            className="!px-3 !py-1.5 !text-xs !rounded-lg"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-[#B91C1C] dark:text-red-400">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {files.map((file) => {
            const isPdf =
              file.mimeType === 'application/pdf' ||
              file.name.toLowerCase().endsWith('.pdf');
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-lg border border-[#E5DAC7] dark:border-[#343842] bg-white dark:bg-[#1B1D23] p-2.5"
              >
                {isPdf ? (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#7A1629]/10 dark:bg-[#7A1629]/30 text-[#7A1629] dark:text-[#F3B9C3]">
                    <HardDrive className="h-5 w-5" aria-hidden="true" />
                  </div>
                ) : (
                  <DriveImage
                    src={file.url}
                    driveFileId={file.driveFileId}
                    alt={file.name}
                    className="h-12 w-12 shrink-0 rounded-md border border-[#E5DAC7] dark:border-[#343842] object-cover bg-[#FAF6EE] dark:bg-[#22242B]"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <DriveFileLink
                    file={file}
                    className="flex items-center gap-1 truncate text-xs font-medium text-[#23181A] dark:text-[#F2EFEA] hover:text-[#7A1629] dark:hover:text-[#E8C97A] underline-offset-2 hover:underline"
                  />
                  <span className="text-[11px] text-[#66585B] dark:text-[#A19B91] tabular-nums block">
                    {(file.size / 1024).toFixed(0)} KB
                    {file.storageProvider === 'google_drive' ? ' · Google Drive' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(file)}
                  aria-label={`ลบไฟล์ ${file.name}`}
                  className="rounded-md p-1.5 text-[#66585B] dark:text-[#A19B91] hover:bg-[#FEE2E2] dark:hover:bg-red-950/60 hover:text-[#B91C1C] dark:hover:text-red-300 transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <WorkspaceConfirmDialog
        request={pendingConfirm?.request || null}
        busy={uploading}
        onConfirm={runPendingConfirm}
        onCancel={() => {
          if (!uploading) setPendingConfirm(null);
        }}
      />
    </div>
  );
}
