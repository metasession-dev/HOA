'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, FileText, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';

const textareaClass = cn(
  'flex w-full rounded-lg bg-card px-3 py-2 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}

export default function VendorTenderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [t, setT] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [proposal, setProposal] = useState('');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!id) return;
    api.get<any>(`/vendor-portal/tenders/${id}`)
      .then((r) => {
        setT(r.data);
        if (r.data?.myBid) {
          setAmount(String(Number(r.data.myBid.amount)));
          setProposal(r.data.myBid.proposal || '');
          setAttachments(Array.isArray(r.data.myBid.attachments) ? r.data.myBid.attachments : []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(Number(amount) > 0)) {
      toast({ variant: 'error', title: 'Enter your bid amount', description: 'The amount must be greater than zero.' });
      return;
    }
    if (!proposal.trim()) {
      toast({ variant: 'error', title: 'Add a proposal', description: 'Describe your offer for this contract.' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/vendor-portal/tenders/bids', {
        tenderId: id,
        amount: Number(amount),
        currency: t?.currency,
        proposal: proposal.trim(),
        attachments: attachments.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType, size: a.size ?? 0 })),
      });
      toast({ variant: 'success', title: t?.myBid ? 'Bid updated' : 'Bid submitted' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not submit bid', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const budgetText = t && (t.budgetMin != null || t.budgetMax != null)
    ? `${t.budgetMin != null ? formatCurrency(Number(t.budgetMin), t.currency) : '…'} – ${t.budgetMax != null ? formatCurrency(Number(t.budgetMax), t.currency) : '…'}`
    : null;

  return (
    <div className="space-y-6">
      <Link href="/vendor/tenders" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors">
        <ChevronLeft className="h-3 w-3" />Tenders
      </Link>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>
      ) : !t ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Tender not found.</CardContent></Card>
      ) : (
        <>
          <header>
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">{t.title}</h1>
            <p className="mt-1 text-body text-muted-foreground">
              {t.category ? `${t.category} · ` : ''}Closes {formatDate(t.closesAt)}{budgetText ? ` · Budget ${budgetText}` : ''}
            </p>
          </header>

          <Card><CardContent className="space-y-3 p-6">
            <p className="whitespace-pre-wrap text-sm text-graphite">{t.description}</p>
            {t.scopeOfWork && (
              <div className="border-t border-stone-surface pt-3">
                <p className="mb-1 text-caption uppercase tracking-wider text-muted-foreground">Scope of work</p>
                <p className="whitespace-pre-wrap text-sm text-graphite">{t.scopeOfWork}</p>
              </div>
            )}
            {Array.isArray(t.attachments) && t.attachments.length > 0 && (
              <div className="border-t border-stone-surface pt-3">
                <p className="mb-1 text-caption uppercase tracking-wider text-muted-foreground">Documents</p>
                <ul className="space-y-1">
                  {t.attachments.map((a: any, i: number) => (
                    <li key={i}>
                      <a href={resolveFileUrl(a.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-graphite hover:text-ember-orange">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />{a.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent></Card>

          {t.myBid?.status === 'awarded' ? (
            <Card><CardContent className="flex items-center gap-3 p-6">
              <Trophy className="h-5 w-5 text-success" />
              <p className="text-body font-medium text-charcoal-primary">Congratulations — your bid was selected for this contract.</p>
            </CardContent></Card>
          ) : t.myBid && !t.canBid ? (
            <Card><CardContent className="p-6">
              <p className="text-body text-charcoal-primary">
                Your bid of {formatCurrency(Number(t.myBid.amount), t.myBid.currency)} is recorded
                {t.myBid.status ? ` (${t.myBid.status})` : ''}. Bidding is now closed.
              </p>
            </CardContent></Card>
          ) : !t.canBid ? (
            <Card><CardContent className="p-6">
              <p className="text-body text-muted-foreground">This tender isn&apos;t open for bids.</p>
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-6">
              <h3 className="mb-4 text-heading-sm font-display font-medium text-charcoal-primary">
                {t.myBid ? 'Update your bid' : 'Submit a bid'}
              </h3>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Your price</Label>
                    <Input id="amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Input value={t.currency} disabled />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proposal">Proposal</Label>
                  <textarea id="proposal" className={textareaClass} rows={5} value={proposal} onChange={(e) => setProposal(e.target.value)} placeholder="Describe your offer, approach, timeline, and what's included." required />
                </div>
                <FileUpload
                  value={attachments}
                  onChange={setAttachments}
                  kind="document"
                  label="Supporting documents (optional)"
                  helpText="Quotes, company profile, references (PDF or image)."
                  accept={['application/pdf', 'image/jpeg', 'image/png', 'image/webp']}
                />
                <div className="flex justify-end">
                  <Button type="submit" loading={submitting}>{submitting ? 'Submitting…' : t.myBid ? 'Update bid' : 'Submit bid'}</Button>
                </div>
              </form>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}
