import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchMe, checkSetupStatus } from '@/store/auth.slice';
import { LoadingState } from '@/components/shared/loading-state';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { user, accessToken, needsSetup } = useAppSelector((s) => s.auth);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (needsSetup === null) {
      dispatch(checkSetupStatus());
    }
  }, [dispatch, needsSetup]);

  useEffect(() => {
    // Only fetch /me once per session, not on every re-mount
    if (accessToken && !user && !fetchedRef.current) {
      fetchedRef.current = true;
      dispatch(fetchMe());
    }
  }, [dispatch, accessToken, user]);

  // Still loading setup status
  if (needsSetup === null) {
    return <LoadingState message="Loading..." />;
  }

  // First time — needs registration
  if (needsSetup) {
    return <Navigate to="/app/auth/register" state={{ from: location }} replace />;
  }

  // Not logged in
  if (!accessToken) {
    return <Navigate to="/app/auth/login" state={{ from: location }} replace />;
  }

  // Token exists but user not loaded yet
  if (!user) {
    return <LoadingState message="Authenticating..." />;
  }

  // Onboarding not completed — redirect (unless already on onboarding page)
  if (!user.onboardingCompleted && !location.pathname.startsWith('/app/onboarding')) {
    return <Navigate to="/app/onboarding" replace />;
  }

  return <>{children}</>;
}
