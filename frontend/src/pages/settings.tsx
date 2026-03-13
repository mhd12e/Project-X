import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Meta } from '@/components/shared/meta';
import {
  Sun,
  Moon,
  Monitor,
  Mail,
  Shield,
  Calendar,
  Pencil,
  Check,
  X,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { useAppSelector, useAppDispatch } from '@/store';
import { fetchMe, logout } from '@/store/auth.slice';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

// ---- Theme option card ----

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun; description: string }[] = [
  { value: 'light', label: 'Light', icon: Sun, description: 'Clean and bright' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
  { value: 'system', label: 'System', icon: Monitor, description: 'Match your OS' },
];

function ThemeCard({
  value,
  label,
  icon: Icon,
  description,
  selected,
  onSelect,
}: {
  value: Theme;
  label: string;
  icon: typeof Sun;
  description: string;
  selected: boolean;
  onSelect: (t: Theme) => void;
}) {
  return (
    <button
      onClick={() => onSelect(value)}
      className={cn(
        'group relative flex w-32 flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all duration-200',
        selected
          ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
          : 'border-border hover:border-primary/40 hover:bg-muted/50',
      )}
    >
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
          selected
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="w-full text-center">
        <p className={cn('text-sm font-medium', selected && 'text-primary')}>{label}</p>
        <p className="text-xs text-muted-foreground mx-auto">{description}</p>
      </div>
      {selected && (
        <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </div>
      )}
    </button>
  );
}

// ---- Mini theme previews ----

function PreviewHalf({ dark }: { dark: boolean }) {
  return (
    <div className={cn('flex h-full flex-1', dark ? 'bg-zinc-900' : 'bg-white')}>
      <div className={cn('w-7 border-r', dark ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-200 bg-zinc-50')}>
        <div className="mx-1 mt-2 h-1.5 w-5 rounded-sm bg-violet-500" />
        <div className={cn('mx-1 mt-1.5 h-1 w-4 rounded-sm', dark ? 'bg-zinc-600' : 'bg-zinc-200')} />
        <div className={cn('mx-1 mt-1 h-1 w-3.5 rounded-sm', dark ? 'bg-zinc-700' : 'bg-zinc-200')} />
      </div>
      <div className="flex-1 p-1.5">
        <div className={cn('h-1.5 w-10 rounded-sm', dark ? 'bg-zinc-600' : 'bg-zinc-300')} />
        <div className={cn('mt-1.5 h-5 w-full rounded', dark ? 'bg-zinc-800' : 'bg-zinc-100')} />
        <div className={cn('mt-1 h-3 w-full rounded', dark ? 'bg-zinc-800' : 'bg-zinc-100')} />
      </div>
    </div>
  );
}

function ThemePreview({ value }: { value: Theme }) {
  if (value === 'system') {
    return (
      <div className="flex aspect-[16/10] w-full overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-600">
        <div className="w-1/2 overflow-hidden">
          <PreviewHalf dark={false} />
        </div>
        <div className="w-1/2 overflow-hidden border-l border-zinc-300">
          <PreviewHalf dark />
        </div>
      </div>
    );
  }

  const isDark = value === 'dark';

  return (
    <div
      className={cn(
        'aspect-[16/10] w-full overflow-hidden rounded-lg border',
        isDark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-200 bg-white',
      )}
    >
      <PreviewHalf dark={isDark} />
    </div>
  );
}

// ---- Profile info row ----

function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

// ---- Main page ----

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  // Password change state
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete account state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const handleSaveName = useCallback(async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === user?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await api.patch('/auth/me', { name: trimmed });
      await dispatch(fetchMe()).unwrap();
      toast.success('Name updated');
      setEditingName(false);
    } catch {
      toast.error('Failed to update name');
    } finally {
      setSavingName(false);
    }
  }, [nameValue, user?.name, dispatch]);

  const startEditing = () => {
    setNameValue(user?.name ?? '');
    setEditingName(true);
  };

  const handleChangePassword = useCallback(async () => {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed successfully');
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message ?? 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    if (!deletePassword) {
      toast.error('Password is required');
      return;
    }
    setDeleting(true);
    try {
      await api.delete('/auth/account', { data: { password: deletePassword } });
      toast.success('Platform has been reset');
      dispatch(logout({ needsSetup: true }));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message ?? 'Failed to delete account');
      setDeleting(false);
    }
  }, [deletePassword, deleteConfirmText, dispatch]);

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-8">
      <Meta title="Settings" />
      <PageHeader
        title="Settings"
        subtitle="Manage your profile and preferences."
      />

      <div className="mx-auto max-w-3xl space-y-6">
        {/* ---- Profile Card ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Your personal information and Gravatar profile picture.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              {/* Avatar */}
              <div className="relative shrink-0">
                <Avatar className="h-24 w-24 border-2 border-border shadow-sm">
                  {user?.avatarUrl && (
                    <AvatarImage src={user.avatarUrl} alt={user.name ?? 'User'} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <Badge
                  variant="secondary"
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] px-1.5 py-0"
                >
                  Gravatar
                </Badge>
              </div>

              {/* Info */}
              <div className="flex-1 w-full space-y-1">
                {/* Editable name */}
                <div className="flex items-center gap-2">
                  {editingName ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        autoFocus
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                        className="h-8 text-sm max-w-[240px]"
                        disabled={savingName}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={handleSaveName}
                        disabled={savingName}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditingName(false)}
                        disabled={savingName}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold">{user?.name ?? 'User'}</h3>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={startEditing}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">{user?.email ?? '—'}</p>

                <Separator className="!mt-4 !mb-1" />

                <div className="grid gap-0 sm:grid-cols-3">
                  <ProfileField icon={Mail} label="Email" value={user?.email ?? '—'} />
                  <ProfileField icon={Shield} label="Role" value={user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'} />
                  <ProfileField icon={Calendar} label="Member since" value={memberSince} />
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Profile picture is managed through{' '}
              <a
                href="https://gravatar.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Gravatar
              </a>
              . Update it there and it will appear here automatically.
            </p>
          </CardContent>
        </Card>

        {/* ---- Appearance Card ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Choose how the application looks to you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="text-sm font-medium">Theme</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Select your preferred color scheme.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {THEME_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex flex-col items-center gap-3">
                  <div className="w-full">
                    <ThemePreview value={opt.value} />
                  </div>
                  <ThemeCard
                    {...opt}
                    selected={theme === opt.value}
                    onSelect={setTheme}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ---- Account Card ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Account information and security settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Password</Label>
                <p className="text-xs text-muted-foreground">
                  Change your account password.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPasswordOpen(true)}>
                Change password
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-destructive">Danger zone</Label>
                <p className="text-xs text-muted-foreground">
                  Permanently delete your account and reset the entire platform.
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                Delete account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Change Password Dialog ---- */}
      <Dialog open={passwordOpen} onOpenChange={(open) => {
        setPasswordOpen(open);
        if (!open) {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setShowCurrentPw(false);
          setShowNewPw(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="current-pw">Current password</Label>
              <div className="relative">
                <Input
                  id="current-pw"
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={changingPassword}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  tabIndex={-1}
                >
                  {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw">New password</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={changingPassword}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowNewPw(!showNewPw)}
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-xs text-destructive">Must be at least 8 characters</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changingPassword}
                onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }}
              />
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)} disabled={changingPassword}>
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
            >
              {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Account Dialog ---- */}
      <Dialog open={deleteOpen} onOpenChange={(open) => {
        if (!deleting) {
          setDeleteOpen(open);
          if (!open) {
            setDeletePassword('');
            setDeleteConfirmText('');
            setShowDeletePw(false);
          }
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete account & reset platform
            </DialogTitle>
            <DialogDescription>
              This action is irreversible. It will permanently delete your account,
              all conversations, documents, knowledge base, and activity logs.
              The platform will be reset to its initial setup state.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-destructive font-medium">This will:</p>
              <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                <li>- Delete your user account</li>
                <li>- Remove all chat conversations and messages</li>
                <li>- Delete all knowledge documents and vectors</li>
                <li>- Clear all activity logs</li>
                <li>- Remove all uploaded files</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-pw">Enter your password</Label>
              <div className="relative">
                <Input
                  id="delete-pw"
                  type={showDeletePw ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  disabled={deleting}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowDeletePw(!showDeletePw)}
                  tabIndex={-1}
                >
                  {showDeletePw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={deleting}
                onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteAccount(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting || !deletePassword || deleteConfirmText !== 'DELETE'}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete account & reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
