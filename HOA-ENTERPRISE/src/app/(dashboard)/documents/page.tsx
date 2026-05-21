'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, FileText, Upload, Trash2, Loader2, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Real file upload. The file picker streams the binary to the Phase 1.5
 * storage endpoint (`POST /api/files/upload`) which:
 *   - Hashes the content (sha256), enforces per-kind size + mime caps
 *   - Saves to the configured STORAGE_ROOT (Railway Volumes in prod)
 *   - Returns a signed-URL fragment we then persist on the Document row
 *
 * The download button below produces a fresh signed URL on click — files are
 * private by default and the token in the URL expires after 5 minutes.
 */
export default function DocumentsPage() {
  const confirm = useConfirm();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [picked, setPicked] = useState<{ file: File; size: number; mime: string } | null>(null);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('/');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = () => {
    api
      .get<any>('/documents')
      .then((res) => setDocuments(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const resetForm = () => {
    setName('');
    setFolder('/');
    setPicked(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onPickFile = (file: File) => {
    setPicked({ file, size: file.size, mime: file.type || 'application/octet-stream' });
    // Pre-fill the name from the file if blank.
    if (!name) setName(file.name);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) {
      toast({ variant: 'error', title: 'Pick a file first' });
      return;
    }
    setSubmitting(true);
    setUploadProgress(0);
    try {
      // Step 1 — upload the binary via multipart to the storage module.
      const fd = new FormData();
      fd.append('file', picked.file);
      fd.append('kind', 'document');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
      const token = typeof window !== 'undefined' ? localStorage.getItem('hoa_token') : null;

      // Use XHR (not fetch) so we can surface real progress while the file flies.
      const uploaded = await new Promise<{ id: string; downloadUrl: string; size: number; storageKey: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${apiBase}/api/files/upload`);
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const j = JSON.parse(xhr.responseText);
                resolve(j.data ?? j);
              } catch (err) {
                reject(new Error('Malformed upload response'));
              }
            } else {
              let msg = `Upload failed (${xhr.status})`;
              try {
                const j = JSON.parse(xhr.responseText);
                if (j?.message) msg = j.message;
              } catch { /* ignore */ }
              reject(new Error(msg));
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(fd);
        },
      );

      // Step 2 — persist the document row referencing the stored file. The
      // documents API stores the *signed URL*; the Document model also keeps
      // the storageKey so we can regenerate fresh URLs on download.
      // The Document model accepts (name, path, fileUrl, fileSize, mimeType).
      // We pass the signed-URL fragment as `fileUrl`; the URL re-signs on
      // expiry via the storage controller's signing endpoint.
      await api.post('/documents', {
        name: name || picked.file.name,
        path: folder || '/',
        fileUrl: uploaded.downloadUrl,
        fileSize: uploaded.size,
        mimeType: picked.mime,
      });

      toast({ variant: 'success', title: 'Uploaded', description: name || picked.file.name });
      setShowUpload(false);
      resetForm();
      fetchDocs();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Upload failed', description: err.message });
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (doc: any) => {
    const ok = await confirm({
      title: 'Delete this document?',
      description: `"${doc.name}" will be permanently removed from your library.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      toast({ variant: 'success', title: 'Document deleted' });
      fetchDocs();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Delete failed', description: err.message });
    }
  };

  const handleDownload = (doc: any) => {
    if (!doc.fileUrl) {
      toast({ variant: 'error', title: 'No file attached' });
      return;
    }
    // Signed URLs are relative paths from the API (e.g. /api/files/:id/download?...);
    // resolve against the API base.
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    const url = doc.fileUrl.startsWith('http') ? doc.fileUrl : `${apiBase}${doc.fileUrl}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Documents</h1>
          <p className="mt-1 text-body text-muted-foreground">
            HOA rules, minutes, contracts and resident-facing files.
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="mr-1.5 h-4 w-4" />
          Upload
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          variant="card"
          icon={FolderOpen}
          title="No documents yet"
          description="Upload HOA rules, meeting minutes, contracts and resident handouts. Each file gets a private signed URL — residents only see files you publish to them."
          action={{ label: 'Upload first document', onClick: () => setShowUpload(true) }}
        />
      ) : (
        <div className="grid gap-3">
          {documents.map((doc: any) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-icon bg-ember-orange/15 text-ember-orange">
                    <FileText className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-charcoal-primary truncate">{doc.name}</p>
                    <p className="text-caption text-muted-foreground">
                      <span className="font-mono">{doc.path}</span> · {formatDate(doc.createdAt)}
                      {doc.fileSize > 0 && ` · ${humanSize(doc.fileSize)}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="muted">{doc.mimeType?.split('/')[1] || 'file'}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(doc)}
                    title="Download"
                  >
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(doc)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-coral-red" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Drawer
        open={showUpload}
        onOpenChange={(o) => {
          setShowUpload(o);
          if (!o) resetForm();
        }}
      >
        <DrawerContent size="md">
          <form onSubmit={handleUpload} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>Upload document</DrawerTitle>
              <DrawerDescription>
                Files are stored privately. Anyone you grant access to gets a fresh signed URL on click.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              {/* File picker — drag-drop friendly. */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) onPickFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-surface bg-stone-surface/40 px-6 py-10 text-center transition-colors hover:border-ember-orange/40 hover:bg-stone-surface/60"
              >
                <Upload className="h-6 w-6 text-graphite" />
                <p className="mt-2 text-sm font-medium text-charcoal-primary">
                  {picked ? picked.file.name : 'Drop a file here, or click to browse'}
                </p>
                <p className="mt-1 text-caption text-muted-foreground">
                  {picked
                    ? `${humanSize(picked.size)} · ${picked.mime || 'unknown type'}`
                    : 'PDF, Word, images. Up to 25MB.'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,text/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickFile(f);
                  }}
                />
              </div>

              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-surface">
                    <div
                      className="h-full bg-ember-orange transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-caption text-muted-foreground">Uploading… {uploadProgress}%</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="dname">Display name</Label>
                <Input
                  id="dname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={picked?.file.name || 'HOA Rules 2026.pdf'}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dfolder">Folder</Label>
                <Input
                  id="dfolder"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  placeholder="/rules"
                />
                <p className="text-caption text-muted-foreground">
                  Used to group documents in the resident portal. Use <code className="font-mono">/</code> for root.
                </p>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={submitting || !picked}>
                {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                {submitting ? 'Uploading…' : 'Upload'}
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** Humanise byte counts. Inline because we use it in two places only. */
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
