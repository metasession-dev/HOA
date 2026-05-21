'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import { toast } from '@/components/ui/use-toast';

export default function SubmitAppealPage() {
  const { id } = useParams();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast({ variant: 'error', title: 'Reason required' });
      return;
    }
    setSubmitting(true);
    try {
      const idempKey = `appeal-${id}-${Date.now()}`;
      await api.post(`/violations/${id}/appeals`, { reason, evidence }, idempKey);
      toast({ variant: 'success', title: 'Appeal submitted', description: 'The board will review and decide.' });
      router.push(`/violations/${id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Submission failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <Link href={`/violations/${id}`} className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />
        Back to violation
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Appeal this notice</h1>
        <p className="mt-1 text-body text-muted-foreground">Tell the board why you believe the violation should be reconsidered.</p>
      </header>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="reason">Your reasoning</Label>
              <textarea
                id="reason"
                rows={8}
                className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="Explain the context, mitigating factors, and any inaccuracies in the original notice."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={4000}
              />
            </div>
            <FileUpload
              value={evidence}
              onChange={setEvidence}
              maxFiles={10}
              kind="violation_photo"
              accept={['image/jpeg', 'image/png', 'image/webp', 'application/pdf']}
              label="Supporting evidence (optional)"
              helpText="Photos, receipts, or documents that support your appeal."
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit appeal'}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
