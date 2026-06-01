'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, ChevronRight, Tags } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
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
  const [logoFiles, setLogoFiles] = useState<UploadedFile[]>([]);
  const [savingBranding, setSavingBranding] = useState(false);
  const { locale, setLocale } = useI18n();
  const { reload: reloadOrgSettings } = useOrgSettings();
  const { refreshUser } = useAuth();

  useEffect(() => {
    api.get<any>('/organizations/current').then((res) => {
      setOrg(res.data);
      if (res.data?.logoUrl) {
        setLogoFiles([{ url: res.data.logoUrl, filename: 'Current logo', contentType: 'image/png' }]);
      }
    }).catch(console.error);
  }, []);

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    try {
      await api.put('/organizations/current/branding', {
        logoUrl: logoFiles[0]?.url ?? null,
        accentColor: org.accentColor || null,
        brandingTagline: org.brandingTagline?.trim() || null,
        emailFromName: org.emailFromName?.trim() || null,
        emailFromEmail: org.emailFromEmail?.trim() || null,
      });
      await reloadOrgSettings();
      toast({ variant: 'success', title: 'Branding saved' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally {
      setSavingBranding(false);
    }
  };

  const changeDisplayLanguage = (l: string) => {
    setLocale(l as any);
    // Persist to the user's profile too, so the choice follows their account.
    api.put('/me/profile', { language: l }).catch(() => {});
    toast({ variant: 'success', title: 'Display language updated' });
  };

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
                <Label htmlFor="language">Default communication language</Label>
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
                <p className="text-caption text-muted-foreground">Used for resident emails &amp; notices.</p>
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
        <CardContent className="space-y-5 p-6">
          <div>
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Branding</h3>
            <p className="text-caption text-muted-foreground">
              Your logo, accent colour and tagline appear across the resident app, login screens and emails.
            </p>
          </div>

          <FileUpload
            value={logoFiles}
            onChange={setLogoFiles}
            kind="org_logo"
            maxFiles={1}
            label="Logo"
            helpText="A square PNG or JPG works best."
            accept={['image/png', 'image/jpeg', 'image/webp']}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="accent">Accent colour</Label>
              <div className="flex items-center gap-3">
                <input
                  id="accent"
                  type="color"
                  value={org.accentColor || '#2f6f4f'}
                  onChange={(e) => setOrg({ ...org, accentColor: e.target.value })}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-stone-surface bg-card"
                />
                <Input
                  value={org.accentColor || ''}
                  onChange={(e) => setOrg({ ...org, accentColor: e.target.value })}
                  placeholder="#2F6F4F"
                  className="max-w-[160px]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={org.brandingTagline || ''}
                onChange={(e) => setOrg({ ...org, brandingTagline: e.target.value })}
                placeholder="e.g. A community that cares"
              />
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-stone-surface bg-stone-surface/30 p-4">
            <div>
              <h4 className="text-body font-medium text-charcoal-primary">Email sender</h4>
              <p className="text-caption text-muted-foreground">
                What residents see in the “from” line of your emails. Leave blank to use your organisation name with the platform address.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fromName">From name</Label>
                <Input
                  id="fromName"
                  value={org.emailFromName || ''}
                  onChange={(e) => setOrg({ ...org, emailFromName: e.target.value })}
                  placeholder={org.name || 'Your organisation'}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fromEmail">From email</Label>
                <Input
                  id="fromEmail"
                  type="email"
                  value={org.emailFromEmail || ''}
                  onChange={(e) => setOrg({ ...org, emailFromEmail: e.target.value })}
                  placeholder="noreply@metasession.co"
                />
                <p className="text-caption text-muted-foreground">
                  Must be on a domain verified in Resend, or delivery will fail.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button type="button" onClick={handleSaveBranding} disabled={savingBranding}>
              {savingBranding ? 'Saving…' : 'Save branding'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Link href="/settings/payment-configuration" className="block">
        <Card className="transition-shadow hover:shadow-soft">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-surface text-graphite">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Payment configuration</h3>
              <p className="text-caption text-muted-foreground">
                Connect your Paystack account so residents can pay levies online into your HOA&rsquo;s account.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href="/settings/billing-catalog" className="block">
        <Card className="transition-shadow hover:shadow-soft">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-surface text-graphite">
              <Tags className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Billing catalog</h3>
              <p className="text-caption text-muted-foreground">
                Define the recurring charges units carry — water, service charge, association dues — and their price and term.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

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
              onChange={(e) => changeDisplayLanguage(e.target.value)}
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
