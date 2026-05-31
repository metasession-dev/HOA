'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';

function friendlyError(err: any): string {
  const raw: string = err?.message || '';
  if (/amount/i.test(raw)) return 'Please enter a valid invoice amount.';
  if (/dueDate|issueDate|date/i.test(raw)) return 'Please choose valid issue and due dates.';
  if (/duplicate/i.test(raw)) return 'An invoice with this number already exists. Use a different number.';
  if (/blacklisted|suspended/i.test(raw)) return raw;
  return raw || 'Something went wrong. Please try again.';
}

export default function SubmitVendorInvoicePage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [form, setForm] = useState({
    vendorInvoiceNo: '',
    amount: '',
    issueDate: '',
    dueDate: '',
    notes: '',
  });
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<any>('/vendor-portal/me')
      .then((r) => setMe(r.data))
      .catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) {
      toast({ variant: 'error', title: 'Enter an amount', description: 'The invoice total must be greater than zero.' });
      return;
    }
    if (!form.issueDate || !form.dueDate) {
      toast({ variant: 'error', title: 'Dates required', description: 'Please choose both an issue date and a due date.' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/vendor-portal/invoices', {
        vendorInvoiceNo: form.vendorInvoiceNo.trim() || undefined,
        amount: Number(form.amount),
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        notes: form.notes.trim() || undefined,
        attachments: attachments.map((a) => ({
          url: a.url,
          filename: a.filename,
          contentType: a.contentType,
          size: a.size ?? 0,
        })),
      });
      toast({ variant: 'success', title: 'Invoice submitted', description: 'Your invoice is now in the approval queue.' });
      router.push('/vendor/invoices');
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not submit invoice', description: friendlyError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const restricted = me && me.status !== 'active';

  return (
    <div className="space-y-6">
      <Link
        href="/vendor/invoices"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        My invoices
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Submit an invoice</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Upload your invoice and enter the details. The HOA will review and process payment.
        </p>
      </header>

      {restricted ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-body text-charcoal-primary">
              Your vendor account is <strong>{me.status}</strong> — you can&apos;t submit invoices right now.
            </p>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vendorInvoiceNo">Your invoice number (optional)</Label>
                  <Input
                    id="vendorInvoiceNo"
                    value={form.vendorInvoiceNo}
                    onChange={(e) => set('vendorInvoiceNo', e.target.value)}
                    placeholder="e.g. INV-2026-014"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => set('amount', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="issueDate">Issue date</Label>
                  <Input
                    id="issueDate"
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => set('issueDate', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dueDate">Due date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => set('dueDate', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Anything the HOA should know about this invoice"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <FileUpload
                value={attachments}
                onChange={setAttachments}
                kind="vendor_invoice"
                label="Invoice document"
                helpText="Attach your invoice or receipt (PDF or image, up to 10 files)."
                accept={['application/pdf', 'image/jpeg', 'image/png', 'image/webp']}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Submitting…' : 'Submit invoice'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
