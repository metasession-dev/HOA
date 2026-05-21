'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useOrgSettings } from '@/providers/org-settings-provider';
import { useAuth } from '@/providers/auth-provider';
import { AFRICA_TIMEZONES, AFRICA_REGIONS, formatTimezoneLabel } from '@/lib/africa-timezones';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function SettingsPage() {
  const [org, setOrg] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const { locale, setLocale } = useI18n();
  const { reload: reloadOrgSettings } = useOrgSettings();
  const { refreshUser } = useAuth();

  useEffect(() => {
    api.get<any>('/organizations/current').then((res) => setOrg(res.data)).catch(console.error);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/organizations/current', {
        name: org.name,
        country: org.country,
        currency: org.currency,
        timezone: org.timezone,
        language: org.language,
      });
      // Push the new currency/timezone/language into the OrgSettings cache
      // immediately so every page that uses formatCurrency() / formatDate()
      // reflects the change without a hard page reload. Without this call,
      // the module-level cache in lib/utils stays stale until the user logs
      // out and back in (or hard-refreshes), which silently breaks things
      // like new-budget creation that snapshot the org currency at submit.
      await reloadOrgSettings();
      // Also bust the AuthProvider's cached user — `useAuth().organizationName`
      // (used in the dashboard greeting + many other places) reads from
      // `user.roles[0].organizationName`, which is now stale until we
      // re-fetch /auth/profile. Without this, the org-name change only
      // shows after the next page reload / re-login.
      await refreshUser();
      toast({ variant: 'success', title: 'Settings saved' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!org) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
          Organization settings
        </h1>
        <p className="mt-1 text-body text-muted-foreground">
          The basics — your HOA name, locale and currency.
        </p>
      </header>

      <form onSubmit={handleSave}>
        <Card>
          <CardContent className="space-y-5 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">General</h3>

            <div className="space-y-1.5">
              <Label htmlFor="orgName">Organization name</Label>
              <Input
                id="orgName"
                value={org.name}
                onChange={(e) => setOrg({ ...org, name: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="country">Country</Label>
                <select
                  id="country"
                  className={selectClass}
                  value={org.country}
                  onChange={(e) => setOrg({ ...org, country: e.target.value })}
                >
                  <option value="ZA">South Africa</option>
                  <option value="NG">Nigeria</option>
                  <option value="KE">Kenya</option>
                  <option value="GH">Ghana</option>
                  <option value="UG">Uganda</option>
                  <option value="TZ">Tanzania</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <select
                  id="currency"
                  className={selectClass}
                  value={org.currency}
                  onChange={(e) => setOrg({ ...org, currency: e.target.value })}
                >
                  <option value="ZAR">ZAR — South African Rand</option>
                  <option value="NGN">NGN — Nigerian Naira</option>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="GHS">GHS — Ghanaian Cedi</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  className={selectClass}
                  value={org.timezone}
                  onChange={(e) => setOrg({ ...org, timezone: e.target.value })}
                >
                  {AFRICA_REGIONS.map((region) => (
                    <optgroup key={region} label={region}>
                      {AFRICA_TIMEZONES.filter((z) => z.region === region).map((tz) => (
                        <option key={tz.id} value={tz.id}>
                          {formatTimezoneLabel(tz)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  className={selectClass}
                  value={org.language}
                  onChange={(e) => setOrg({ ...org, language: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="fr">French</option>
                  <option value="pt">Portuguese</option>
                  <option value="sw">Swahili</option>
                  <option value="af">Afrikaans</option>
                  <option value="zu">isiZulu</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">My display language</h3>
          <p className="text-caption text-muted-foreground">
            This only changes how the dashboard reads on your devices. Org-wide email/SMS language is set above.
          </p>
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="userLocale">Language</Label>
            <select
              id="userLocale"
              className={selectClass}
              value={locale}
              onChange={(e) => setLocale(e.target.value as any)}
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="pt">Português</option>
              <option value="sw">Kiswahili</option>
            </select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
