'use client';

/**
 * Reusable client-side list controls: text search, a date-range filter, and
 * pagination. Resident-facing lists are small (per-unit), so filtering and
 * paging on the client keeps every list page consistent without bespoke API
 * params. Use the `useListControls` hook to derive the page slice, then render
 * <ListToolbar/> above the list and <ListPager/> below it.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ListControls<T> {
  q: string;
  setQ: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  page: number;
  setPage: (n: number) => void;
  totalPages: number;
  total: number;
  pageSize: number;
  pageItems: T[];
}

export function useListControls<T>(
  items: T[],
  opts: { searchText?: (t: T) => string; date?: (t: T) => string | Date | null | undefined; pageSize?: number },
): ListControls<T> {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = opts.pageSize ?? 10;

  const filtered = useMemo(() => {
    let rows = items;
    const s = q.trim().toLowerCase();
    if (s && opts.searchText) rows = rows.filter((t) => opts.searchText!(t).toLowerCase().includes(s));
    if ((from || to) && opts.date) {
      const fromT = from ? new Date(from).getTime() : -Infinity;
      const toT = to ? new Date(to).getTime() + 86_400_000 - 1 : Infinity; // inclusive end-of-day
      rows = rows.filter((t) => {
        const d = opts.date!(t);
        if (!d) return false;
        const dt = new Date(d).getTime();
        return dt >= fromT && dt <= toT;
      });
    }
    return rows;
  }, [items, q, from, to, opts]);

  // Snap back to page 1 whenever the filtered set changes.
  useEffect(() => { setPage(1); }, [q, from, to, items]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { q, setQ, from, setFrom, to, setTo, page: safePage, setPage, totalPages, total: filtered.length, pageSize, pageItems };
}

export function ListToolbar<T>({ c, searchPlaceholder = 'Search…', showDate = true, className }: { c: ListControls<T>; searchPlaceholder?: string; showDate?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={searchPlaceholder} value={c.q} onChange={(e) => c.setQ(e.target.value)} />
      </div>
      {showDate && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-caption text-muted-foreground">From</label>
            <Input type="date" value={c.from} max={c.to || undefined} onChange={(e) => c.setFrom(e.target.value)} className="w-[9.5rem]" />
          </div>
          <div className="space-y-1">
            <label className="text-caption text-muted-foreground">To</label>
            <Input type="date" value={c.to} min={c.from || undefined} onChange={(e) => c.setTo(e.target.value)} className="w-[9.5rem]" />
          </div>
          {(c.from || c.to || c.q) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { c.setQ(''); c.setFrom(''); c.setTo(''); }}>Clear</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function ListPager<T>({ c }: { c: ListControls<T> }) {
  if (c.total === 0) return null;
  const start = (c.page - 1) * c.pageSize + 1;
  const end = Math.min(c.page * c.pageSize, c.total);
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-caption text-muted-foreground">{start}–{end} of {c.total}</p>
      {c.totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={c.page <= 1} onClick={() => c.setPage(c.page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-caption text-muted-foreground">Page {c.page} of {c.totalPages}</span>
          <Button type="button" variant="secondary" size="sm" disabled={c.page >= c.totalPages} onClick={() => c.setPage(c.page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
