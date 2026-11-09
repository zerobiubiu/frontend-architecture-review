import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router';
import { HomePage } from '@/routes/home-page';
import { RouteErrorPage } from './error-page';
import { NotFoundPage } from './not-found';
import { RootLayout } from './root-layout';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

/**
 * Engineering Playground 只在开发环境注册。
 * 动态导入让生产构建不把验证页打进主包，也不会因访问 `/dev/playground` 得到可操作页面。
 */
const playgroundRoute = import.meta.env.DEV
  ? createRoute({
      getParentRoute: () => rootRoute,
      path: '/dev/playground',
      component: lazyRouteComponent(() => import('@/routes/dev/playground-page'), 'PlaygroundPage'),
    })
  : null;

const routeTree = rootRoute.addChildren([indexRoute, ...(playgroundRoute ? [playgroundRoute] : [])]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 30_000,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
