import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { useSession } from '@/app/runtime-context';
import { ApplicationShell } from '@/components/shared/application-shell';
import { PROTOCOL_STUB_MODE, ProtocolModeBanner } from '@/components/shared/protocol-mode-banner';
import { ThemeModeToggle } from '@/components/shared/theme-mode-toggle';
import { PlaygroundLayout } from './playground-layout';

export function RootLayout() {
  const location = useLocation();
  const snapshot = useSession();
  if (import.meta.env.DEV && location.pathname === '/dev/playground') return <PlaygroundLayout />;
  if (snapshot.status === 'authenticated' && location.pathname !== '/login') {
    return (
      <ApplicationShell>
        <Outlet />
      </ApplicationShell>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col bg-body text-primary">
      {PROTOCOL_STUB_MODE ? <ProtocolModeBanner /> : null}
      <header className="border-border border-b bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="font-semibold text-primary no-underline">
            美股交易管理
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/login" search={{ returnTo: '/' }} className="text-secondary text-sm">
              账号登录
            </Link>
            <ThemeModeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-border border-t px-4 py-4 text-center text-secondary text-xs">
        平台身份与业务连接分别确认；客户端状态不构成交易许可。
      </footer>
    </div>
  );
}
