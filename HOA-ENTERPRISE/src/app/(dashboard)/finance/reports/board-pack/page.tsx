'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Download, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { IncomeStatementView, BalanceSheetView, CashFlowView } from '../statement-views';

export default function BoardPackPage() {
  const sp = useSearchParams();
  const from = sp.get('from') || `${new Date().getUTCFullYear()}-01-01`;
  const to = sp.get('to') || new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<any>(`/finance/reports/board-pack?from=${from}&to=${to}`).then((r) => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [from, to]);

  /**
   * Hit the server-rendered PDF endpoint with the bearer token, save the
   * response Blob, and trigger a browser download. We can't use a plain
   * <a download> link because the endpoint is auth-gated.
   */
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
      const token = typeof window !== 'undefined' ? localStorage.getItem('hoa_token') : null;
      const res = await fetch(
        `${apiBase}/api/finance/reports/board-pack.pdf?from=${from}&to=${to}&download=1`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`PDF generation failed (${res.status}). ${body.slice(0, 120)}`);
      }
      const blob = await res.blob();
      const filename =
        res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        `board-pack-${from}-to-${to}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Download failed', description: err.message });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-3xl space-y-4 p-4"><Skeleton className="h-12" /><Skeleton className="h-96" /></div>;
  if (!data) return <p className="p-10 text-center">No data</p>;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8 space-y-8">
      <header className="flex items-center justify-between gap-3">
        <Link href="/finance/reports" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
          <ChevronLeft className="h-3 w-3" />Reports
        </Link>
        <Button onClick={handleDownload} disabled={downloading}>
          {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
          {downloading ? 'Preparing…' : 'Download PDF'}
        </Button>
      </header>

      <div className="space-y-8 board-pack">
        <section className="cover">
          <div className="flex items-center gap-4 mb-4">
            {data.organization.logoUrl ? (
              <img src={data.organization.logoUrl} alt={data.organization.name} className="h-16 w-16 rounded-icon" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-icon bg-midnight">
                <span className="font-display text-2xl text-white">{data.organization.name[0]}</span>
              </div>
            )}
            <div>
              <p className="text-caption text-muted-foreground uppercase tracking-wider">Board pack</p>
              <h1 className="font-display text-heading-lg text-charcoal-primary">{data.organization.name}</h1>
            </div>
          </div>
          <div className="rounded-lg bg-stone-surface/50 p-4 space-y-1">
            <p className="text-sm text-graphite">Period: {fmt(data.period.from)} – {fmt(data.period.to)}</p>
            <p className="text-caption text-muted-foreground">Currency: {data.organization.currency}</p>
            <p className="text-caption text-muted-foreground">Generated: {fmt(new Date().toISOString())}</p>
          </div>
        </section>

        <IncomeStatementView data={data.income} compact />
        <BalanceSheetView data={data.balance} compact />
        <CashFlowView data={data.cash} compact />
      </div>
    </div>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
