'use client';

/**
 * Self-service account page. Three discrete cards so each save is
 * independent and a failure on one doesn't strand work on another:
 *   - Profile (firstName / lastName / phone)
 *   - Password (current + new + confirm)
 *   - Avatar (uses the real-upload FileUpload primitive)
 *
 * Mirrors the resident PWA's /account page so the surface is consistent.
 */
import { useEffect, useState } from 'react';
import { Lock, Mail, Phone, User, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import { toast } from '@/components/ui/use-toast';
import { getInitials } from '@/lib/utils';

export default function ProfileSettingsPage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Profile card
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password card
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Avatar card — FileUpload returns an UploadedFile[] with the URL after
  // the server-side upload completes. We immediately PUT that URL on the
  // profile so the change persists without a separate "Save" click.
  const [avatar, setAvatar] = useState<UploadedFile[]>([]);
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    api
      .get<any>('/me/profile')
      .then((r) => {
        setProfile(r.data);
        setForm({
          firstName: r.data.firstName ?? '',
          lastName: r.data.lastName ?? '',
          phone: r.data.phone ?? '',
        });
        if (r.data.avatarUrl) {
          setAvatar([{ url: r.data.avatarUrl, filename: 'avatar', contentType: 'image/png' }]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const r = await api.put<any>('/me/profile', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || null,
      });
      setProfile((p: any) => ({ ...p, ...r.data }));
      // Bust the AuthProvider's cached user so the topbar avatar / name
      // chip and any other consumer of useAuth() show the new value
      // immediately, no refresh required.
      await refreshUser();
      toast({ variant: 'success', title: 'Profile updated' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err?.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newPassword.length < 8) {
      toast({ variant: 'error', title: 'New password too short', description: 'Use at least 8 characters.' });
      return;
    }
    if (pw.newPassword !== pw.confirm) {
      toast({ variant: 'error', title: "Passwords don't match" });
      return;
    }
    setSavingPw(true);
    try {
      await api.post('/me/password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      toast({ variant: 'success', title: 'Password updated', description: 'Other devices have been signed out.' });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not change password', description: err?.message });
    } finally {
      setSavingPw(false);
    }
  };

  // Persist the avatar URL the moment the upload completes. The FileUpload
  // primitive already streamed the bytes to /api/files/upload before this
  // callback fires, so we're just storing the URL on the user profile.
  const handleAvatarChange = async (files: UploadedFile[]) => {
    setAvatar(files);
    const url = files[0]?.url ?? null;
    setSavingAvatar(true);
    try {
      await api.put('/me/profile', { avatarUrl: url });
      setProfile((p: any) => ({ ...p, avatarUrl: url }));
      await refreshUser();
      toast({ variant: 'success', title: url ? 'Avatar updated' : 'Avatar removed' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not update avatar', description: err?.message });
    } finally {
      setSavingAvatar(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Your account</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Update your name, contact details, password, and avatar.
        </p>
      </header>

      {/* Identity summary — read-only cue showing email + role + access. */}
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-stone-surface text-base font-medium text-graphite">
            {profile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : user ? (
              getInitials(user.firstName, user.lastName)
            ) : (
              '·'
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-charcoal-primary truncate">
              {profile ? `${profile.firstName} ${profile.lastName}` : '—'}
            </p>
            <p className="text-caption text-muted-foreground inline-flex items-center gap-1.5">
              <Mail className="h-3 w-3" />
              {profile?.email ?? '—'}
            </p>
          </div>
          {user?.roles && user.roles.length > 0 && (
            <div className="hidden sm:flex flex-col items-end gap-1">
              {user.roles.slice(0, 2).map((r) => (
                <Badge key={`${r.role}-${r.organizationId}`} variant="muted">
                  {r.roleName ?? r.role}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile card */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="font-display text-heading-sm font-medium text-charcoal-primary">Profile</h2>
            <p className="mt-1 text-caption text-muted-foreground">
              Used across audit logs, sent emails, and the sidebar greeting.
            </p>
          </div>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="firstName"
                    className="pl-9"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone"
                  className="pl-9"
                  placeholder="+27 82 123 4567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={loading}
                />
              </div>
              <p className="text-caption text-muted-foreground">
                Used for two-factor sign-in via SMS where supported.
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password card */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="font-display text-heading-sm font-medium text-charcoal-primary">Password</h2>
            <p className="mt-1 text-caption text-muted-foreground">
              Changing your password signs out your other devices.
            </p>
          </div>
          <form onSubmit={savePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pl-9 pr-9"
                  value={pw.currentPassword}
                  onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
                  required
                />
                <button
                  type="button"
                  aria-label={showCurrent ? 'Hide' : 'Show'}
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-graphite"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pl-9 pr-9"
                    value={pw.newPassword}
                    onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    aria-label={showNew ? 'Hide' : 'Show'}
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-graphite"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                  required
                  minLength={8}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={savingPw}>
                {savingPw ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Avatar card */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="font-display text-heading-sm font-medium text-charcoal-primary">Avatar</h2>
            <p className="mt-1 text-caption text-muted-foreground">
              Shown next to your name in the sidebar and audit log entries.
            </p>
          </div>
          <FileUpload
            value={avatar}
            onChange={handleAvatarChange}
            maxFiles={1}
            kind="user_avatar"
            accept={['image/jpeg', 'image/png', 'image/webp']}
            label=""
            helpText={savingAvatar ? 'Saving…' : 'PNG, JPG or WebP, up to a few MB.'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
