import { useId, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { api } from '../services/api';
import type { UploadedFileMeta } from '../types/scholarship';
import { validateUploadFile } from '../utils/scholarshipLogic';

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

  const accept = allowPdf
    ? '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'
    : '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

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

    setUploading(true);
    try {
      const uploaded: UploadedFileMeta[] = [];
      for (const file of selected) {
        const meta = await api.uploadFile(file);
        uploaded.push(meta);
      }

      if (!multiple) {
        onChange(uploaded.slice(0, 1));
      } else {
        const combined = [...files, ...uploaded];
        onChange(maxCount ? combined.slice(0, maxCount) : combined);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (id: string) => {
    onChange(files.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-[#23181A]">
          {label}
        </label>
        <span className="text-xs text-[#66585B] tabular-nums">
          แนบแล้ว {files.length} ไฟล์
          {minCount ? ` · ขั้นต่ำ ${minCount} ไฟล์` : ''}
          {` · สูงสุด ${maxSizeMB} MB/ไฟล์`}
        </span>
      </div>

      <p className="text-xs text-[#66585B]">{helperText}</p>

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#C6922C]/60 bg-[#FAF6EE] px-4 py-2 text-xs font-medium text-[#7A1629] transition-colors hover:bg-[#F1E6D0] ${
            uploading ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์อัปโหลด'}</span>
        </label>
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleSelectFiles}
          className="sr-only"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-[#B91C1C]">
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
                className="flex items-center gap-3 rounded-lg border border-[#E5DAC7] bg-white p-2.5"
              >
                {isPdf ? (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#7A1629]/10 text-[#7A1629]">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </div>
                ) : (
                  <img
                    src={file.url}
                    alt={file.name}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 shrink-0 rounded-md border border-[#E5DAC7] object-cover bg-[#FAF6EE]"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs font-medium text-[#23181A] hover:text-[#7A1629] underline-offset-2 hover:underline"
                  >
                    {file.name}
                  </a>
                  <span className="text-[11px] text-[#66585B] tabular-nums">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(file.id)}
                  aria-label={`ลบไฟล์ ${file.name}`}
                  className="rounded-md p-1.5 text-[#66585B] hover:bg-[#FEE2E2] hover:text-[#B91C1C] transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
