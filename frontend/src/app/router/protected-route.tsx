import { useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { useSession } from '@/app/runtime-context';
import { type Capability, hasCapability } from '@/features/auth/permissions';
import { safeReturnTo } from '@/features/auth/return-to';
import { SessionState } from '@/features/auth/session-state';
import { ForbiddenPage } from './forbidden';

export function ProtectedRoute({
  children,
  capability = 'workspace',
}: {
  readonly children: ReactNode;
  readonly capability?: Capability;
}) {
  const snapshot = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = safeReturnTo(location.href);
  useEffect(() => {
    // pending 期间旧路由仍会渲染；到达登录目标后不再次启动同一次导航。
    if (snapshot.status === 'anonymous' && location.pathname !== '/login') {
      void navigate({ to: '/login', search: { returnTo }, replace: true });
    }
  }, [navigate, snapshot.status, location.pathname, returnTo]);
  if (snapshot.status === 'anonymous') return null;
  if (snapshot.status !== 'authenticated' || !snapshot.user) return <SessionState />;
  if (!hasCapability(snapshot.user, capability)) return <ForbiddenPage />;
  return children;
}
