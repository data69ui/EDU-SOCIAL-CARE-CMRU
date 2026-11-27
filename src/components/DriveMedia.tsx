import { useEffect, useState } from 'react';
import { ExternalLink, FileText, HardDrive } from 'lucide-react';
import { buildDriveImagePreviewUrl } from '../services/googleSheetsDb';
import type { UploadedFileMeta } from '../types/scholarship';

interface DriveImageProps {
  src: string;
  driveFileId?: string;
  alt: string;
  className?: string;
}

export function DriveImage({ src, driveFileId, alt, className = '' }: DriveImageProps) {
  const [imgSrc, setImgSrc] = useState<string>(() => buildDriveImagePreviewUrl(src, driveFileId));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setImgSrc(buildDriveImagePreviewUrl(src, driveFileId));
  }, [src, driveFileId]);

  if (!imgSrc || failed) {
    return (
      <div
        title={`${alt} (จัดเก็บบน Google Drive)`}
        className={`flex items-center justify-center bg-[#F4ECDD] dark:bg-[#2B2518] text-[#7A1629] dark:text-[#E8C97A] ${className}`}
      >
        <HardDrive className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => {
        if (src && imgSrc !== src) {
          setImgSrc(src);
        } else {
          setFailed(true);
        }
      }}
      className={className}
    />
  );
}

interface DriveFileLinkProps {
  file: UploadedFileMeta;
  className?: string;
}

export function DriveFileLink({ file, className = '' }: DriveFileLinkProps) {
  const targetHref = file.driveWebViewLink || file.url;

  return (
    <a
      href={targetHref}
      target="_blank"
      rel="noreferrer"
      className={
        className ||
        'inline-flex items-center gap-1 text-xs font-medium text-[#7A1629] dark:text-[#E8C97A] hover:underline'
      }
    >
      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{file.name}</span>
      {file.storageProvider === 'google_drive' && (
        <ExternalLink className="h-3 w-3 shrink-0 text-[#66585B] dark:text-[#A19B91]" aria-hidden="true" />
      )}
    </a>
  );
}
