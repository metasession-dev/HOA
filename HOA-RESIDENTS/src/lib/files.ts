import { api } from './api';

/**
 * File download helpers.
 *
 * Uploaded files are served via short-lived SIGNED URLs
 * (`/api/files/:id/download?exp=…&sig=…`, ~5 min TTL). Many surfaces persist
 * that signed URL on the record (notice attachments, request photos, etc.). By
 * the time a user clicks, the signature has usually expired → the API returns
 * `403 {"message":"Signed URL expired"}`.
 *
 * The fix: never trust the persisted signature. On click, re-mint a fresh URL
 * through `GET /files/:id`. We can recover the file id from `storedFileId` when
 * present, or by parsing it out of the persisted download URL — so this works
 * for legacy records that only stored the URL.
 */

export function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}

/** Pull the stored file id out of a `/api/files/:id/download…` URL. */
export function fileIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/\/files\/([^/?]+)\/download/);
  return m ? m[1] : null;
}

export interface DownloadableAttachment {
  url?: string;
  storedFileId?: string;
  filename?: string;
}

/**
 * Resolve a fresh, non-expired download URL for an attachment. Falls back to
 * the persisted URL if the file id can't be determined or the re-sign fails
 * (e.g. truly public files served without a signature).
 */
export async function freshDownloadUrl(att: DownloadableAttachment): Promise<string | undefined> {
  const fileId = att.storedFileId || fileIdFromUrl(att.url);
  if (fileId) {
    try {
      const r = await api.get<any>(`/files/${fileId}`);
      const fresh = r.data?.downloadUrl;
      if (fresh) return resolveFileUrl(fresh);
    } catch {
      /* fall through to the persisted url */
    }
  }
  return att.url ? resolveFileUrl(att.url) : undefined;
}

/** Open an uploaded attachment in a new tab using a freshly-signed URL. */
export async function downloadAttachment(att: DownloadableAttachment): Promise<void> {
  const url = await freshDownloadUrl(att);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
