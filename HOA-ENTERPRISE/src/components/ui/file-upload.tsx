'use client';

/**
 * Real file upload primitive — streams binaries to `/api/files/upload` (the
 * Phase 1.5 storage module) and persists the returned signed-URL fragment +
 * sha256-deduped metadata on the parent form's `value` array.
 *
 * Drop-in replacement for the metadata-only stub. The external API
 * (`value: UploadedFile[]` + `onChange`) is unchanged so existing callers
 * (payables, resale, violations, appeals) keep working without edits.
 *
 * UX:
 *   - Drag-and-drop OR click-to-browse the picker.
 *   - Per-file XHR progress bar while bytes fly.
 *   - Inline error toasts on mime / size rejections from the server.
 *   - Per-file remove button — also soft-deletes the StoredFile on the server.
 */
import * as React from 'react';
import { Upload, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Label } from './label';
import { toast } from './use-toast';
import { cn } from '@/lib/utils';

export type UploadedFile = {
  /** Signed URL fragment, e.g. `/api/files/:id/download?exp=…&sig=…`. */
  url: string;
  filename: string;
  contentType: string;
  size?: number;
  /** Server-side StoredFile id — used to soft-delete on remove. */
  storedFileId?: string;
};

export interface FileUploadProps {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  /** Accepted MIME types — passed through to the picker. */
  accept?: string[];
  label?: string;
  helpText?: string;
  /**
   * Per-kind size + mime caps live on the server; the `kind` here tells the
   * storage module which policy to apply. Defaults to "document" (25MB,
   * pdf/word/excel/image).
   */
  kind?:
    | 'document'
    | 'violation_photo'
    | 'vendor_invoice'
    | 'resale_attachment'
    | 'broadcast_attachment'
    | 'user_avatar'
    | 'org_logo'
    | 'misc';
}

interface InFlight {
  id: string;
  file: File;
  progress: number;
  error?: string;
}

export function FileUpload({
  value,
  onChange,
  maxFiles = 10,
  accept,
  label = 'Attachments',
  helpText,
  kind = 'document',
}: FileUploadProps) {
  const [inFlight, setInFlight] = React.useState<InFlight[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const remaining = maxFiles - value.length - inFlight.length;
  const acceptAttr = accept?.join(',');

  const beginUpload = (file: File) => {
    const tempId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setInFlight((cur) => [...cur, { id: tempId, file, progress: 0 }]);

    // Avatars and org logos are displayed via plain <img src> long after the
    // short-lived signed URL would expire, so we store them as public files and
    // reference a stable, signature-less URL. Everything else stays private
    // (signed URLs).
    const isPublicKind = kind === 'user_avatar' || kind === 'org_logo';

    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    if (isPublicKind) fd.append('isPublic', 'true');
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('hoa_token') : null;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase}/api/files/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      setInFlight((cur) => cur.map((u) => (u.id === tempId ? { ...u, progress: pct } : u)));
    };

    xhr.onload = () => {
      setInFlight((cur) => cur.filter((u) => u.id !== tempId));
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          const data = json.data ?? json;
          // For public assets, build a stable absolute URL (no expiring sig) so
          // it renders indefinitely in <img>. Private files keep the signed URL
          // exactly as before (callers handle those).
          const stableUrl = `${apiBase}/api/files/${data.id}/download`;
          const uploaded: UploadedFile = {
            url: isPublicKind ? stableUrl : data.downloadUrl,
            filename: file.name,
            contentType: file.type || guessType(file.name),
            size: data.size ?? file.size,
            storedFileId: data.id,
          };
          // Use the latest `value` from props at the moment the upload
          // resolves — call the onChange closure to avoid stale-state races
          // when multiple files upload concurrently.
          onChange([...latestValueRef.current, uploaded]);
        } catch (err: any) {
          toast({ variant: 'error', title: 'Upload failed', description: 'Malformed server response' });
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const j = JSON.parse(xhr.responseText);
          if (j?.message) msg = j.message;
        } catch { /* ignore */ }
        toast({ variant: 'error', title: 'Upload failed', description: msg });
      }
    };

    xhr.onerror = () => {
      setInFlight((cur) => cur.filter((u) => u.id !== tempId));
      toast({ variant: 'error', title: 'Upload failed', description: 'Network error' });
    };

    xhr.send(fd);
  };

  // Track the latest `value` in a ref so concurrent upload callbacks don't
  // overwrite each other's onChange when they all fire close together.
  const latestValueRef = React.useRef(value);
  React.useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const handlePicked = (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    for (const f of arr) {
      if (remaining <= 0) {
        toast({ variant: 'error', title: 'Limit reached', description: `Max ${maxFiles} files.` });
        break;
      }
      beginUpload(f);
    }
    // Reset the input so re-picking the same file re-triggers onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const remove = async (idx: number) => {
    const target = value[idx];
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
    // Best-effort soft-delete on the server. Failure is non-fatal — the row
    // can be reaped by an admin sweep later.
    if (target.storedFileId) {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
        const token =
          typeof window !== 'undefined' ? localStorage.getItem('hoa_token') : null;
        await fetch(`${apiBase}/api/files/${target.storedFileId}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch { /* ignore */ }
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {helpText && <p className="text-caption text-muted-foreground">{helpText}</p>}

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((f, idx) => (
            <li
              key={f.storedFileId ?? `${idx}-${f.filename}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 shadow-inset-stone text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                {f.contentType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a
                    href={resolveFileUrl(f.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                    title="Open preview"
                  >
                    <img
                      src={resolveFileUrl(f.url)}
                      alt={f.filename}
                      className="h-10 w-10 rounded object-cover ring-1 ring-stone-surface"
                    />
                  </a>
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <a
                  href={resolveFileUrl(f.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-graphite hover:text-ember-orange"
                >
                  {f.filename}
                </a>
                {f.size != null && (
                  <span className="shrink-0 text-caption text-muted-foreground">{humanSize(f.size)}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-stone-surface hover:text-coral-red"
                aria-label={`Remove ${f.filename}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* In-flight uploads — show progress until they resolve. */}
      {inFlight.length > 0 && (
        <ul className="space-y-1.5">
          {inFlight.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-stone-surface/40 px-3 py-2 text-sm"
            >
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                <span className="truncate text-graphite">{u.file.name}</span>
              </div>
              <div className="w-32 shrink-0">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-surface">
                  <div className="h-full bg-ember-orange transition-all" style={{ width: `${u.progress}%` }} />
                </div>
                <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{u.progress}%</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handlePicked(e.dataTransfer.files);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-surface bg-stone-surface/30 px-6 py-6 text-center transition-colors',
            'hover:border-ember-orange/40 hover:bg-stone-surface/60',
          )}
        >
          <Upload className="h-5 w-5 text-graphite" />
          <p className="mt-1.5 text-sm font-medium text-charcoal-primary">
            Drop files here, or click to browse
          </p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {accept
              ? `${accept.map((a) => a.split('/')[1]?.toUpperCase() || a).join(', ')} · `
              : ''}
            {remaining} of {maxFiles} remaining
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptAttr}
            className="hidden"
            onChange={(e) => handlePicked(e.target.files)}
          />
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">Max {maxFiles} files reached.</p>
      )}
    </div>
  );
}

/** Resolve a (possibly relative) file URL against the API origin for display. */
function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}

function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function guessType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}
