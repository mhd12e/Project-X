import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { register, clearError, checkSetupStatus } from '@/store/auth.slice';
import { Meta } from '@/components/shared/meta';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { accessToken, user, needsSetup, loading, error } = useAppSelector((s) => s.auth);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (needsSetup === null) {
      dispatch(checkSetupStatus());
    }
  }, [dispatch, needsSetup]);

  useEffect(() => {
    return () => { dispatch(clearError()); };
  }, [dispatch]);

  useEffect(() => {
    if (!accessToken || !user) return;
    const target = user.onboardingCompleted ? '/app' : '/app/onboarding';
    setFadingOut(true);
    const timer = setTimeout(() => navigate(target, { replace: true }), 500);
    return () => clearTimeout(timer);
  }, [accessToken, user, navigate]);

  // Registration disabled once a user exists
  if (needsSetup === false) {
    return <Navigate to="/app/auth/login" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(register({ name, email, password }));
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background p-4 transition-all duration-500 ease-out"
      style={{
        opacity: fadingOut ? 0 : 1,
        transform: fadingOut ? 'scale(0.97) translateY(-8px)' : 'scale(1) translateY(0)',
      }}
    >
      <Meta title="Create Account" description="Set up your Project X administrator account." />
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Project X</h1>
          <Badge variant="outline" className="border-primary/30 text-primary text-[9px] font-semibold uppercase tracking-widest">
            Initial Setup
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-lg">Create your account</CardTitle>
            <p className="text-center text-xs text-muted-foreground">
              This is the first time setup. You&apos;ll be the admin.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Self-hosted instance. This creates the administrator account.
        </p>
      </div>
    </div>
  );
}
