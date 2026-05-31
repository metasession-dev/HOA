'use client';

import { useEffect, useState } from 'react';
import { Plus, Send, Megaphone, Mail, MessageSquare, BellRing, Paperclip } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';

const BROADCAST_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime'];

function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}

const channelMeta: Record<string, { icon: typeof Mail; label: string }> = {
  email: { icon: Mail, label: 'Email' },
  sms: { icon: MessageSquare, label: 'SMS' },
  push: { icon: BellRing, label: 'Push' },
};

export default function CommunicationsPage() {
  const confirm = useConfirm();
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
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

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/communications/broadcasts', {
        ...form,
        attachments: attachments.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType, size: a.size ?? 0 })),
      });
      toast({ variant: 'success', title: 'Draft saved', description: form.subject });
      setShowCreate(false);
      setForm({ subject: '', body: '', channels: ['email'] });
      setAttachments([]);
      fetchBroadcasts();
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
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
            Communications
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
            Broadcasts and notices to your residents.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New broadcast
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : broadcasts.length === 0 ? (
        <EmptyState
          variant="card"
          icon={Megaphone}
          title="No broadcasts yet"
          description="Send your first community update — water outages, meeting reminders, gate procedure changes. You can pick channels and target groups per broadcast."
          action={{ label: 'New broadcast', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b: any) => (
            <Card key={b.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-heading-sm font-medium text-charcoal-primary truncate">
                      {b.subject}
                    </h3>
                    <Badge variant={b.status === 'sent' ? 'success' : 'muted'}>{b.status}</Badge>
                    {b.channels?.map((ch: string) => {
                      const meta = channelMeta[ch];
                      if (!meta) return null;
                      const Icon = meta.icon;
                      return (
                        <span
                          key={ch}
                          className="inline-flex items-center gap-1 rounded-full bg-stone-surface px-2 py-0.5 text-[11px] text-graphite"
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-caption text-muted-foreground">{formatDate(b.createdAt)}</p>
                  <p className="mt-2 text-body text-graphite line-clamp-2">{b.body}</p>
                  {Array.isArray(b.attachments) && b.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {b.attachments.map((a: any, i: number) => (
                        <a
                          key={i}
                          href={resolveFileUrl(a.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-stone-surface px-2 py-0.5 text-[11px] text-graphite hover:text-ember-orange"
                        >
                          <Paperclip className="h-3 w-3" />
                          {a.filename}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {b.status === 'draft' && (
                  <Button size="sm" onClick={() => handleSend(b)}>
                    <Send className="mr-1 h-3.5 w-3.5" />
                    Send
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                  placeholder="e.g. Water maintenance — Friday"
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
                          active
                            ? 'bg-midnight text-white'
                            : 'bg-stone-surface text-graphite hover:bg-stone-surface/80',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {channelMeta[ch].label}
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
                helpText="Image, PDF, or short video clip (max 50MB each)."
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
