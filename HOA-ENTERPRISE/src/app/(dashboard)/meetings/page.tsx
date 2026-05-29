'use client';

/**
 * Meetings — schedule a meeting (AGM, board, community) and send calendar
 * invites to a chosen audience. Each invitee gets an in-app notification plus
 * an email with "Add to Google Calendar" + a downloadable .ics (works with
 * Google Calendar, Outlook, Apple Calendar, Zoom). Paste a Zoom / Google Meet
 * link as the online URL.
 */
import { useEffect, useState } from 'react';
import { CalendarDays, Plus, Send, X, MapPin, Video, Users } from 'lucide-react';
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

const AUDIENCES = [
  { id: 'all_residents', label: 'All residents' },
  { id: 'owners', label: 'Owners only' },
  { id: 'exco', label: 'Exco / board' },
  { id: 'everyone', label: 'Everyone (residents + staff)' },
];
const audienceLabel = (a: string) => AUDIENCES.find((x) => x.id === a)?.label ?? a;

const selectClass =
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

const statusBadge: Record<string, 'muted' | 'success' | 'destructive' | 'info'> = {
  draft: 'muted', sent: 'success', cancelled: 'destructive',
};

function localDefault(offsetHours: number) {
  const d = new Date(Date.now() + offsetHours * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  // datetime-local wants local time without timezone suffix.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MeetingsPage() {
  const confirm = useConfirm();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', location: '', onlineUrl: '',
    startsAt: localDefault(24), endsAt: localDefault(25), audience: 'all_residents',
  });

  const load = () => {
    setLoading(true);
    api.get<any>('/meetings').then((r) => setMeetings(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const reset = () => setForm({
    title: '', description: '', location: '', onlineUrl: '',
    startsAt: localDefault(24), endsAt: localDefault(25), audience: 'all_residents',
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      return toast({ variant: 'error', title: 'End time must be after the start time' });
    }
    setSubmitting(true);
    try {
      await api.post('/meetings', {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      });
      toast({ variant: 'success', title: 'Meeting scheduled', description: 'Saved as draft — send invites when ready.' });
      setShowCreate(false);
      reset();
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not schedule', description: err.message });
    } finally { setSubmitting(false); }
  };

  const send = async (m: any) => {
    const ok = await confirm({
      title: `Send invites for "${m.title}"?`,
      description: `Calendar invites go to ${audienceLabel(m.audience).toLowerCase()} — in-app + email with Add-to-Calendar links.`,
      confirmText: 'Send invites',
    });
    if (!ok) return;
    try {
      const r = await api.post<any>(`/meetings/${m.id}/send`);
      toast({ variant: 'success', title: 'Invites sent', description: `${r.data.invitedCount} invitee(s).` });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Send failed', description: err.message });
    }
  };

  const cancel = async (m: any) => {
    const ok = await confirm({
      title: `Cancel "${m.title}"?`,
      description: m.status === 'sent' ? 'Invitees will be notified of the cancellation.' : 'This meeting will be marked cancelled.',
      confirmText: 'Cancel meeting',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post(`/meetings/${m.id}/cancel`);
      toast({ variant: 'success', title: 'Meeting cancelled' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const when = (m: any) => {
    const s = new Date(m.startsAt), e = new Date(m.endsAt);
    const t = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${formatDate(m.startsAt)} · ${t(s)}–${t(e)}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Meetings</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Schedule meetings and send calendar invites (Zoom / Google Meet) to residents and exco.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-1.5 h-4 w-4" />Schedule meeting</Button>
      </header>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : meetings.length === 0 ? (
        <EmptyState
          variant="card"
          icon={CalendarDays}
          title="No meetings yet"
          description="Schedule an AGM, board or community meeting and send calendar invites. Invitees get an in-app notification and an email with Add-to-Calendar links."
          action={{ label: 'Schedule meeting', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="grid gap-3">
          {meetings.map((m) => {
            const past = new Date(m.endsAt) < new Date();
            return (
              <Card key={m.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-heading-sm font-medium text-charcoal-primary">{m.title}</h3>
                      <Badge variant={statusBadge[m.status] || 'muted'}>{m.status}</Badge>
                      {past && m.status !== 'cancelled' && <Badge variant="muted">past</Badge>}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{when(m)}</span>
                      {m.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{m.location}</span>}
                      {m.onlineUrl && <a href={m.onlineUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-ember-orange hover:underline"><Video className="h-3.5 w-3.5" />Online link</a>}
                      <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{audienceLabel(m.audience)}</span>
                    </p>
                    {m.description && <p className="mt-2 text-body text-graphite line-clamp-2">{m.description}</p>}
                    {m.status === 'sent' && <p className="mt-1 text-caption text-muted-foreground">Invited {m.invitedCount} · sent {formatDate(m.sentAt)}</p>}
                  </div>
                  {m.status !== 'cancelled' && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" onClick={() => send(m)}>
                        <Send className="mr-1 h-3.5 w-3.5" />{m.status === 'sent' ? 'Resend' : 'Send invites'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => cancel(m)} title="Cancel meeting">
                        <X className="h-4 w-4 text-muted-foreground hover:text-coral-red" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Drawer open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) reset(); }}>
        <DrawerContent size="lg">
          <form onSubmit={create} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>Schedule meeting</DrawerTitle>
              <DrawerDescription>Saved as a draft — review, then send invites to your chosen audience.</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mtitle">Title</Label>
                <Input id="mtitle" required autoFocus value={form.title} placeholder="e.g. Annual General Meeting 2026"
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mdesc">Description / agenda</Label>
                <textarea id="mdesc" rows={4} value={form.description}
                  placeholder="What will be discussed, what attendees should prepare…"
                  className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mstart">Starts</Label>
                  <Input id="mstart" type="datetime-local" required value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mend">Ends</Label>
                  <Input id="mend" type="datetime-local" required value={form.endsAt} min={form.startsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mloc">Location (optional)</Label>
                <Input id="mloc" value={form.location} placeholder="Clubhouse, Block A"
                  onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="murl">Online link — Zoom / Google Meet (optional)</Label>
                <Input id="murl" value={form.onlineUrl} placeholder="https://zoom.us/j/… or https://meet.google.com/…"
                  onChange={(e) => setForm({ ...form, onlineUrl: e.target.value })} />
                <p className="text-caption text-muted-foreground">Paste a Zoom or Google Meet link you created; it’s embedded in the invite and calendar entry.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maud">Audience</Label>
                <select id="maud" className={selectClass} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                  {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" loading={submitting}>{submitting ? 'Saving…' : 'Save meeting'}</Button>
              <DrawerClose asChild><Button type="button" variant="secondary">Cancel</Button></DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
