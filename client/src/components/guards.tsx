import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Loader2 } from 'lucide-react';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireOnboarding() {
  const { session, loading: authLoading } = useAuth();
  const [state, setState] = useState<'loading' | 'has-sub' | 'no-sub'>('loading');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setState('loading');
    api
      .getSubAccount()
      .then(({ sub_account }) => {
        if (cancelled) return;
        setState(sub_account ? 'has-sub' : 'no-sub');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return; // RequireAuth will redirect
        setState('no-sub');
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (authLoading || state === 'loading') return <FullScreenLoader />;
  if (state === 'no-sub') return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

// For /login and /onboarding: send already-onboarded users back to the app.
export function RedirectIfAuthed({ to = '/' }: { to?: string }) {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (session) return <Navigate to={to} replace />;
  return <Outlet />;
}
