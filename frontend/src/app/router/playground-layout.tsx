import { Link, Outlet } from '@tanstack/react-router';
import { ThemeModeToggle } from '@/components/shared/theme-mode-toggle';

/** 应用外壳：本阶段只用 Tailwind 布局 + Astryx 组件，不引入第二套导航组件库。 */
export function PlaygroundLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-body text-primary">
      <header className="border-border border-b bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="font-semibold text-primary text-sm no-underline">
            量化交易平台 · 前端工程
          </Link>
          <nav aria-label="主导航" className="flex items-center gap-4 text-secondary text-sm">
            <Link to="/" className="text-secondary no-underline hover:text-primary">
              工作台
            </Link>
            {import.meta.env.DEV ? (
              <Link to="/dev/playground" className="text-secondary no-underline hover:text-primary">
                Engineering Playground
              </Link>
            ) : null}
          </nav>
          <div className="ms-auto">
            <ThemeModeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-border border-t px-4 py-3 text-center text-secondary text-xs">
        前端工程底座：React + Vite + Astryx + Tailwind CSS v4。当前不连接真实后端，不执行任何真实交易。
      </footer>
    </div>
  );
}
