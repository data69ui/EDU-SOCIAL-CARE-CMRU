import { useEffect, useState } from 'react';
import { ExternalLink, FileText, HardDrive } from 'lucide-react';
import { subscribeGoogleWorkspaceAuth } from '../services/googleAuth';
import { fetchDriveFileBlobUrl } from '../services/googleWorkspace';
import type { UploadedFileMeta } from '../types/scholarship';

interface DriveImageProps {
  src: string;
  driveFileId?: string;
  alt: string;
  className?: string;
}

export function DriveImage({ src, driveFileId, alt, className = '' }: DriveImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>(driveFileId ? '' : src);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    return subscribeGoogleWorkspaceAuth((snap) => {
      setAccessToken(snap.accessToken);
    });
  }, []);

  useEffect(() => {
    if (!driveFileId) {
      setResolvedUrl(src);
      return;
    }
    if (!accessToken) {
      setResolvedUrl('');
      return;
    }

    let cancelled = false;
    let objectUrl = '';

    fetchDriveFileBlobUrl(accessToken, driveFileId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl('');
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [driveFileId, accessToken, src]);

  if (driveFileId && !resolvedUrl) {
    return (
      <div
        title={`${alt} (จัดเก็บบน Google Drive)`}
        className={`flex items-center justify-center bg-[#F4ECDD] text-[#7A1629] ${className}`}
      >
        <HardDrive className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl || src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
    />
  );
}

interface DriveFileLinkProps {
  file: UploadedFileMeta;
  className?: string;
}

export function DriveFileLink({ file, className = '' }: DriveFileLinkProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    return subscribeGoogleWorkspaceAuth((snap) => {
      setAccessToken(snap.accessToken);
    });
  }, []);

  const targetHref = file.driveWebViewLink || file.url;

  const handleOpen = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (file.driveFileId && accessToken && !file.driveWebViewLink) {
      e.preventDefault();
      try {
        const blobUrl = await fetchDriveFileBlobUrl(accessToken, file.driveFileId);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);
      } catch {
        // Ignore
      }
    }
  };

  return (
    <a
      href={targetHref}
      target="_blank"
      rel="noreferrer"
      onClick={handleOpen}
      className={
        className ||
        'inline-flex items-center gap-1 text-xs font-medium text-[#7A1629] hover:underline'
      }
    >
      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{file.name}</span>
      {file.storageProvider === 'google_drive' && (
        <ExternalLink className="h-3 w-3 shrink-0 text-[#66585B]" aria-hidden="true" />
      )}
    </a>
  );
}
