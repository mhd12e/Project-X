import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { login, clearError, checkSetupStatus } from '@/store/auth.slice';
import { Meta } from '@/components/shared/meta';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const { accessToken, user, needsSetup, loading, error } = useAppSelector((s) => s.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (needsSetup === null) {
      dispatch(checkSetupStatus());
    }
  }, [dispatch, needsSetup]);

  useEffect(() => {
    return () => { dispatch(clearError()); };
  }, [dispatch]);

  // Already logged in — go to app
  if (accessToken && user) {
    const target = user.onboardingCompleted ? '/app' : '/app/onboarding';
    return <Navigate to={target} replace />;
  }

  // Still checking setup status — don't flash login form
  if (needsSetup === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // First-time setup: redirect to register (only if not already logged in)
  if (needsSetup && !accessToken) {
    return <Navigate to="/app/auth/register" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(login({ email, password }));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Meta title="Sign In" description="Sign in to your Project X dashboard." />
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Project X</h1>
          <Badge variant="outline" className="border-primary/30 text-primary text-[9px] font-semibold uppercase tracking-widest">
            Private Beta
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-lg">Welcome back</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Self-hosted instance. Contact your administrator for access.
        </p>
      </div>
    </div>
  );
}
