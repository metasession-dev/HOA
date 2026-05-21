'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function NewVotePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'standard' as 'standard' | 'special_resolution' | 'agm',
    anonymous: false,
    eligibilityRule: 'all_owners',
    quorumPercent: 50,
    passThresholdPercent: 50,
    proxyAllowed: true,
    resultsLiveVisible: false,
    allowMultiple: false,
    opensAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16),
    closesAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 16),
    noticePeriodDays: 0,
  });
  const [options, setOptions] = useState([
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const updateOption = (i: number, key: 'id' | 'label', value: string) => {
    const next = [...options];
    next[i] = { ...next[i], [key]: value };
    setOptions(next);
  };

  const addOption = () => setOptions([...options, { id: `opt${options.length + 1}`, label: '' }]);
  const removeOption = (i: number) => setOptions(options.filter((_, idx) => idx !== i));

  const onTypeChange = (t: 'standard' | 'special_resolution' | 'agm') => {
    if (t === 'special_resolution') {
      setForm({ ...form, type: t, passThresholdPercent: 75, noticePeriodDays: 14 });
    } else {
      setForm({ ...form, type: t });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        opensAt: new Date(form.opensAt).toISOString(),
        closesAt: new Date(form.closesAt).toISOString(),
        options,
      };
      const res: any = await api.post('/votes', payload);
      toast({ variant: 'success', title: 'Motion saved as draft' });
      router.push(`/votes/${res.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/votes" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Votes
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">New motion</h1>
        <p className="mt-1 text-body text-muted-foreground">Saved as draft. Second + open before residents can vote.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card><CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea id="description" rows={4} required
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={4000} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <select id="type" className={selectClass} value={form.type} onChange={(e) => onTypeChange(e.target.value as any)}>
                <option value="standard">Standard motion</option>
                <option value="special_resolution">Special resolution (75% + 14-day notice)</option>
                <option value="agm">AGM vote</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule">Eligibility</Label>
              <select id="rule" className={selectClass} value={form.eligibilityRule} onChange={(e) => setForm({ ...form, eligibilityRule: e.target.value })}>
                <option value="all_owners">All owners</option>
                <option value="paid_up_only">Paid-up owners only</option>
                <option value="all_residents">All residents</option>
              </select>
            </div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Options</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addOption}><Plus className="mr-1 h-3 w-3" />Add</Button>
          </div>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input placeholder="id (e.g. yes)" value={o.id} onChange={(e) => updateOption(i, 'id', e.target.value)} className="w-32" />
                <Input placeholder="Label shown to voters" value={o.label} onChange={(e) => updateOption(i, 'label', e.target.value)} className="flex-1" />
                {options.length > 2 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(i)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                )}
              </div>
            ))}
          </div>
        </CardContent></Card>

        <Card><CardContent className="space-y-4 p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Schedule &amp; thresholds</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opensAt">Opens</Label>
              <Input id="opensAt" type="datetime-local" required value={form.opensAt} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closesAt">Closes</Label>
              <Input id="closesAt" type="datetime-local" required value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="quorum">Quorum %</Label>
              <Input id="quorum" type="number" min={1} max={100} value={form.quorumPercent} onChange={(e) => setForm({ ...form, quorumPercent: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pass">Pass threshold %</Label>
              <Input id="pass" type="number" min={1} max={100} value={form.passThresholdPercent} onChange={(e) => setForm({ ...form, passThresholdPercent: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notice">Notice period (days)</Label>
              <Input id="notice" type="number" min={0} max={365} value={form.noticePeriodDays} onChange={(e) => setForm({ ...form, noticePeriodDays: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-graphite">
              <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} />
              Anonymous ballots
            </label>
            <label className="flex items-center gap-2 text-sm text-graphite">
              <input type="checkbox" checked={form.allowMultiple} onChange={(e) => setForm({ ...form, allowMultiple: e.target.checked })} />
              Allow multiple selections
            </label>
            <label className="flex items-center gap-2 text-sm text-graphite">
              <input type="checkbox" checked={form.proxyAllowed} onChange={(e) => setForm({ ...form, proxyAllowed: e.target.checked })} />
              Allow proxy voting
            </label>
            <label className="flex items-center gap-2 text-sm text-graphite">
              <input type="checkbox" checked={form.resultsLiveVisible} onChange={(e) => setForm({ ...form, resultsLiveVisible: e.target.checked })} />
              Show live results to residents
            </label>
          </div>
        </CardContent></Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save as draft'}</Button>
        </div>
      </form>
    </div>
  );
}
