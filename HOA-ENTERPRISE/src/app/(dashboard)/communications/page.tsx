'use client';

import { useEffect, useState } from 'react';
import {
  Plus, Send, Megaphone, Mail, MessageSquare, BellRing,
  Paperclip, Download, FileText, Video, ChevronLeft, Inbox,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';

const BROADCAST_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime'];

function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}

/**
 * Download an attachment via a FRESH signed URL. The url persisted on the
 * broadcast is a short-lived signed link that expires; re-signing through
 * `GET /files/:id` keeps downloads working indefinitely.
 */
async function downloadAttachment(att: any) {
  try {
    if (att.storedFileId) {
      const r = await api.get<any>(`/files/${att.storedFileId}`);
      const url = r.data?.downloadUrl;
      if (url) { window.open(resolveFileUrl(url), '_blank'); return; }
    }
    window.open(resolveFileUrl(att.url), '_blank');
  } catch {
    window.open(resolveFileUrl(att.url), '_blank');
  }
}

const channelMeta: Record<string, { icon: typeof Mail; label: string }> = {
  email: { icon: Mail, label: 'Email' },
  sms: { icon: MessageSquare, label: 'SMS' },
  push: { icon: BellRing, label: 'Push' },
};

function AttachmentRow({ att }: { att: any }) {
  const isImage = att.contentType?.startsWith('image/');
  const isVideo = att.contentType?.startsWith('video/');
  const Icon = isVideo ? Video : FileText;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-stone-surface bg-card p-2.5">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolveFileUrl(att.url)} alt={att.filename} className="h-10 w-10 rounded object-cover ring-1 ring-stone-surface" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-stone-surface text-graphite"><Icon className="h-5 w-5" /></span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-graphite">{att.filename}</span>
      <Button size="sm" variant="secondary" onClick={() => downloadAttachment(att)}>
        <Download className="mr-1 h-3.5 w-3.5" />Download
      </Button>
    </div>
  );
}

export default function CommunicationsPage() {
  const confirm = useConfirm();
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '', channels: ['email'] as string[] });
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBroadcasts = () => {
    api
      .get<any>('/communications/broadcasts')
      .then((res) => setBroadcasts(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBroadcasts(); }, []);

  const selected = broadcasts.find((b) => b.id === selectedId) || null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post<any>('/communications/broadcasts', {
        ...form,
        attachments: attachments.map((a) => ({
          url: a.url, filename: a.filename, contentType: a.contentType, size: a.size ?? 0, storedFileId: a.storedFileId,
        })),
      });
      toast({ variant: 'success', title: 'Draft saved', description: form.subject });
      setShowCreate(false);
      setForm({ subject: '', body: '', channels: ['email'] });
      setAttachments([]);
      fetchBroadcasts();
      if (res.data?.id) setSelectedId(res.data.id);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not save draft', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (b: any) => {
    const ok = await confirm({
      title: `Send "${b.subject}"?`,
      description: 'This will dispatch the broadcast to the selected channels. You can\'t undo a send.',
      confirmText: 'Send broadcast',
    });
    if (!ok) return;
    try {
      await api.post(`/communications/broadcasts/${b.id}/send`);
      toast({ variant: 'success', title: 'Broadcast sent' });
      fetchBroadcasts();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Send failed', description: err.message });
    }
  };

  const toggleChannel = (ch: string) => {
    setForm({
      ...form,
      channels: form.channels.includes(ch)
        ? form.channels.filter((c) => c !== ch)
        : [...form.channels, ch],
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Communications</h1>
          <p className="mt-1 text-body text-muted-foreground">Broadcasts and notices to your residents.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-4 w-4" />New broadcast
        </Button>
      </header>

      {/* Email-style master / detail */}
      <div className="flex h-[calc(100vh-13rem)] overflow-hidden rounded-card border border-stone-surface bg-card">
        {/* Master list */}
        <div className={cn('flex w-full flex-col lg:w-80 lg:shrink-0 lg:border-r lg:border-stone-surface', selected && 'hidden lg:flex')}>
          <div className="border-b border-stone-surface px-4 py-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            All broadcasts
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : broadcasts.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-surface"><Megaphone className="h-5 w-5 text-graphite" /></div>
                <p className="mt-2 text-caption text-muted-foreground">No broadcasts yet.</p>
              </div>
            ) : (
              <ul>
                {broadcasts.map((b) => {
                  const active = b.id === selectedId;
                  const hasAtts = Array.isArray(b.attachments) && b.attachments.length > 0;
                  return (
                    <li key={b.id}>
                      <button
                        onClick={() => setSelectedId(b.id)}
                        className={cn(
                          'flex w-full flex-col gap-0.5 border-b border-stone-surface px-4 py-3 text-left transition-colors',
                          active ? 'bg-sidebar-accent' : 'hover:bg-stone-surface/50',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal-primary">{b.subject}</span>
                          {hasAtts && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          <Badge variant={b.status === 'sent' ? 'success' : 'muted'}>{b.status}</Badge>
                        </div>
                        <span className="truncate text-caption text-muted-foreground">{b.body}</span>
                        <span className="text-[11px] text-muted-foreground">{formatDate(b.sentAt || b.createdAt)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Detail / reading pane */}
        <div className={cn('min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden lg:flex')}>
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div>
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface"><Inbox className="h-6 w-6 text-graphite" /></div>
                <p className="mt-3 text-body text-muted-foreground">Select a broadcast to read it.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              <button onClick={() => setSelectedId(null)} className="mb-4 inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite lg:hidden">
                <ChevronLeft className="h-3.5 w-3.5" />Back
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-heading-md font-display font-medium text-charcoal-primary">{selected.subject}</h2>
                <Badge variant={selected.status === 'sent' ? 'success' : 'muted'}>{selected.status}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-caption text-muted-foreground">{formatDate(selected.sentAt || selected.createdAt)}</p>
                {selected.channels?.map((ch: string) => {
                  const meta = channelMeta[ch];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <span key={ch} className="inline-flex items-center gap-1 rounded-full bg-stone-surface px-2 py-0.5 text-[11px] text-graphite">
                      <Icon className="h-3 w-3" />{meta.label}
                    </span>
                  );
                })}
              </div>

              {selected.status === 'draft' && (
                <div className="mt-4">
                  <Button size="sm" onClick={() => handleSend(selected)}>
                    <Send className="mr-1 h-3.5 w-3.5" />Send broadcast
                  </Button>
                </div>
              )}

              <div className="mt-5 whitespace-pre-wrap text-body leading-relaxed text-graphite">{selected.body}</div>

              {Array.isArray(selected.attachments) && selected.attachments.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />Attachments
                  </h3>
                  <div className="space-y-2">
                    {selected.attachments.map((a: any, i: number) => <AttachmentRow key={i} att={a} />)}
                  </div>
                </div>
              )}

              {selected.stats && (selected.stats.recipients != null) && (
                <div className="mt-6 flex flex-wrap gap-4 border-t border-stone-surface pt-4 text-caption text-muted-foreground">
                  <span>Recipients: <strong className="text-charcoal-primary">{selected.stats.recipients}</strong></span>
                  {selected.stats.emailed != null && <span>Emailed: <strong className="text-charcoal-primary">{selected.stats.emailed}</strong></span>}
                  {selected.stats.delivered != null && <span>In-app: <strong className="text-charcoal-primary">{selected.stats.delivered}</strong></span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Drawer open={showCreate} onOpenChange={setShowCreate}>
        <DrawerContent size="lg">
          <form onSubmit={handleCreate} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New broadcast</DrawerTitle>
              <DrawerDescription>
                Saved as a draft first — you can preview and pick a target segment before sending.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="e.g. Water maintenance on Friday"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="body">Message</Label>
                <textarea
                  id="body"
                  className="flex min-h-[200px] w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="Write your message…"
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  required
                />
                <p className="text-caption text-muted-foreground">
                  Supports merge fields: {'{{firstName}}'}, {'{{unitNumber}}'}, {'{{outstandingAmount}}'}.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Channels</Label>
                <div className="flex flex-wrap gap-2">
                  {(['email', 'sms', 'push'] as const).map((ch) => {
                    const active = form.channels.includes(ch);
                    const Icon = channelMeta[ch].icon;
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleChannel(ch)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium transition-colors',
                          active ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-stone-surface/80',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />{channelMeta[ch].label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-caption text-muted-foreground">
                  Push goes to residents who have installed the PWA and opted in.
                </p>
              </div>
              <FileUpload
                value={attachments}
                onChange={setAttachments}
                kind="broadcast_attachment"
                label="Attachments (optional)"
                helpText="Image, PDF, or short video clip (max 50MB each). Images and PDFs are also attached to the email; video is sent as a download link."
                accept={BROADCAST_ACCEPT}
              />
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={submitting || form.channels.length === 0}>
                {submitting ? 'Saving…' : 'Save draft'}
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
