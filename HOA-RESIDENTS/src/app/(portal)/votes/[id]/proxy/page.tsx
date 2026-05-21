'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

export default function GrantProxyPage() {
  const { id } = useParams();
  const router = useRouter();
  const [granteeUserId, setGranteeUserId] = useState('');
  const [busy, setBusy] = useState(false);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!granteeUserId.trim()) return;
    setBusy(true);
    try {
      await api.post(`/votes/${id}/proxies`, { granteeUserId: granteeUserId.trim() });
      toast({ variant: 'success', title: 'Proxy granted', description: 'The grantee can now cast on your behalf.' });
      router.push(`/votes/${id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Grant failed', description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Link href={`/votes/${id}`} className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Back to vote
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Grant proxy</h1>
        <p className="mt-1 text-body text-muted-foreground">Authorise another HOA member to cast your ballot on this vote.</p>
      </header>

      <form onSubmit={handleGrant}>
        <Card><CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="grantee">Grantee user ID</Label>
            <Input id="grantee" required value={granteeUserId} onChange={(e) => setGranteeUserId(e.target.value)} placeholder="cu...123" />
            <p className="text-caption text-muted-foreground">
              Ask the person you want to authorise for their user ID — they can find it in their profile.
            </p>
          </div>
          <div className="rounded-lg card-warm p-3 text-caption text-graphite">
            <p>The proxy expires when the vote closes. You can revoke it any time before the grantee casts.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={busy || !granteeUserId.trim()}>{busy ? 'Granting…' : 'Grant proxy'}</Button>
          </div>
        </CardContent></Card>
      </form>
    </div>
  );
}
