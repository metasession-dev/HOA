'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2, GripVertical } from 'lucide-react';
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

// Derive a stable machine id from a human label so admins never see/type ids.
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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
  // Options are just labels now — ids are generated on submit.
  const [options, setOptions] = useState<string[]>(['Yes', 'No']);
  const [submitting, setSubmitting] = useState(false);

  const updateOption = (i: number, value: string) => {
    const next = [...options];
    next[i] = value;
    setOptions(next);
  };
  const addOption = () => setOptions([...options, '']);
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
    const labels = options.map((l) => l.trim()).filter(Boolean);
    if (labels.length < 2) {
      return toast({ variant: 'error', title: 'Add at least two options' });
    }
    // Build {id,label} with de-duplicated slugs. Cap the id at the API's
    // 40-char limit (base ≤36 leaves room for a `-N` dedup suffix).
    const seen = new Set<string>();
    const built = labels.map((label, i) => {
      const base = slug(label).slice(0, 36) || `opt${i + 1}`;
      let id = base;
      let n = 1;
      while (seen.has(id)) id = `${base}-${n++}`;
      seen.add(id);
      return { id, label };
    });
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        opensAt: new Date(form.opensAt).toISOString(),
        closesAt: new Date(form.closesAt).toISOString(),
        options: built,
      };
      const res: any = await api.post('/votes', payload);
      toast({ variant: 'success', title: 'Motion saved as draft' });
      router.push(`/votes/${res.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/votes" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Votes
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">New motion</h1>
        <p className="mt-1 text-body text-muted-foreground">Saved as a draft — second it and open it before residents can vote.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: the motion + its options. */}
          <div className="space-y-4 lg:col-span-2">
            <Card><CardContent className="space-y-4 p-6">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" required value={form.title} placeholder="e.g. Approve the 2026 maintenance levy"
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <textarea id="description" rows={6} required
                  placeholder="Explain what residents are voting on, and the impact of each outcome."
                  className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={4000} />
              </div>
            </CardContent></Card>

            <Card><CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Options</h3>
                  <p className="text-caption text-muted-foreground">What residents can choose between.</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addOption} disabled={options.length >= 20}><Plus className="mr-1 h-3 w-3" />Add option</Button>
              </div>
              <div className="space-y-2">
                {options.map((label, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    <Input placeholder={`Option ${i + 1}`} value={label} maxLength={120} onChange={(e) => updateOption(i, e.target.value)} className="flex-1" />
                    {options.length > 2 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(i)} aria-label="Remove option">
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-coral-red" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent></Card>
          </div>

          {/* Right: configuration. */}
          <div className="space-y-4">
            <Card><CardContent className="space-y-4 p-6">
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Type &amp; eligibility</h3>
              <div className="space-y-1.5">
                <Label htmlFor="type">Type</Label>
                <select id="type" className={selectClass} value={form.type} onChange={(e) => onTypeChange(e.target.value as any)}>
                  <option value="standard">Standard motion</option>
                  <option value="special_resolution">Special resolution</option>
                  <option value="agm">AGM vote</option>
                </select>
                {form.type === 'special_resolution' && (
                  <p className="text-caption text-muted-foreground">Defaults to a 75% pass threshold and a 14-day notice period.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule">Who can vote</Label>
                <select id="rule" className={selectClass} value={form.eligibilityRule} onChange={(e) => setForm({ ...form, eligibilityRule: e.target.value })}>
                  <option value="all_owners">All owners</option>
                  <option value="paid_up_only">Paid-up owners only</option>
                  <option value="all_residents">All residents</option>
                </select>
              </div>
            </CardContent></Card>

            <Card><CardContent className="space-y-4 p-6">
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Schedule &amp; thresholds</h3>
              <div className="space-y-1.5">
                <Label htmlFor="opensAt">Opens</Label>
                <Input id="opensAt" type="datetime-local" required value={form.opensAt} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="closesAt">Closes</Label>
                <Input id="closesAt" type="datetime-local" required value={form.closesAt} min={form.opensAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quorum">Quorum %</Label>
                  <Input id="quorum" type="number" min={1} max={100} value={form.quorumPercent} onChange={(e) => setForm({ ...form, quorumPercent: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pass">Pass %</Label>
                  <Input id="pass" type="number" min={1} max={100} value={form.passThresholdPercent} onChange={(e) => setForm({ ...form, passThresholdPercent: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notice">Notice period (days)</Label>
                <Input id="notice" type="number" min={0} max={365} value={form.noticePeriodDays} onChange={(e) => setForm({ ...form, noticePeriodDays: Number(e.target.value) })} />
              </div>
            </CardContent></Card>

            <Card><CardContent className="space-y-1 p-3">
              <ToggleRow label="Anonymous ballots" desc="Hide who voted for what." checked={form.anonymous} onChange={(v) => setForm({ ...form, anonymous: v })} />
              <ToggleRow label="Multiple selections" desc="Let voters pick more than one option." checked={form.allowMultiple} onChange={(v) => setForm({ ...form, allowMultiple: v })} />
              <ToggleRow label="Proxy voting" desc="Owners may delegate their vote." checked={form.proxyAllowed} onChange={(v) => setForm({ ...form, proxyAllowed: v })} />
              <ToggleRow label="Live results" desc="Residents see the tally before close." checked={form.resultsLiveVisible} onChange={(v) => setForm({ ...form, resultsLiveVisible: v })} />
            </CardContent></Card>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-stone-surface pt-4">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={submitting}>{submitting ? 'Saving…' : 'Save as draft'}</Button>
        </div>
      </form>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-stone-surface/50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ember-orange" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-charcoal-primary">{label}</span>
        <span className="block text-caption text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
}
