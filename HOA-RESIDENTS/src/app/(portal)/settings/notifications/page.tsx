'use client';

/**
 * Phase 10.3 — notification preferences per topic + channel.
 *
 * Reads the full grid (topic × channel) from /api/me/notification-preferences.
 * "Push" toggle reflects the in-browser subscription state — flipping it
 * subscribes/unsubscribes via the PushToggle helper, then saves the row.
 */
import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { PushToggle } from '@/components/push-toggle';

interface Row {
  topic: string;
  email: boolean;
  sms: boolean;
  push: boolean;
  whatsapp: boolean;
}

const TOPIC_LABELS: Record<string, { label: string; hint: string }> = {
  invoices: { label: 'Invoices & levies', hint: 'New invoices, payment reminders, receipts.' },
  payments: { label: 'Payments', hint: 'Payment confirmations and refunds.' },
  requests: { label: 'Maintenance requests', hint: 'Status updates on the requests you raise.' },
  violations: { label: 'Violations', hint: 'Notices issued to your unit and appeal outcomes.' },
  votes: { label: 'Votes & polls', hint: 'New ballots, results, and AGM motions.' },
  broadcasts: { label: 'Community broadcasts', hint: 'Estate newsletters and announcements.' },
  security: { label: 'Security alerts', hint: 'New device sign-ins and MFA changes.' },
  system: { label: 'System messages', hint: 'Important account & platform notices.' },
};

const CHANNELS: Array<{ key: keyof Omit<Row, 'topic'>; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'push', label: 'Push' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

export default function NotificationPreferencesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.get<any>('/me/notification-preferences').then((r) => setRows(r.data || [])).catch(() => {});
  }, []);

  const toggle = (topic: string, channel: keyof Omit<Row, 'topic'>) => {
    setRows((rs) => rs.map((r) => (r.topic === topic ? { ...r, [channel]: !r[channel] } : r)));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/me/notification-preferences', { rows });
      toast({ title: 'Notification preferences saved' });
      setDirty(false);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-charcoal-primary">Notification preferences</h1>
          <p className="text-sm text-muted-foreground">
            Choose how you want to hear from your HOA — per topic, per channel.
          </p>
        </div>
        {dirty && (
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Save
          </Button>
        )}
      </header>

      <PushToggle />

      <section className="rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">Topic</th>
              {CHANNELS.map((c) => (
                <th key={c.key} className="px-4 py-3 text-center">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = TOPIC_LABELS[r.topic] ?? { label: r.topic, hint: '' };
              return (
                <tr key={r.topic} className="border-b border-stone-100 last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-stone-900">{meta.label}</p>
                    {meta.hint && <p className="text-xs text-stone-500">{meta.hint}</p>}
                  </td>
                  {CHANNELS.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${meta.label} via ${c.label}`}
                        checked={Boolean(r[c.key])}
                        onChange={() => toggle(r.topic, c.key)}
                        className="h-4 w-4 cursor-pointer accent-stone-900"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
