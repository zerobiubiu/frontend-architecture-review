import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouteComponent,
} from '@tanstack/react-router';
import { LoginPage } from '@/features/auth/login-page';
import type { Capability } from '@/features/auth/permissions';
import { safeReturnTo } from '@/features/auth/return-to';
import { RouteErrorPage } from './error-page';
import { ForbiddenPage } from './forbidden';
import { NotFoundPage } from './not-found';
import { ProtectedRoute } from './protected-route';
import { RootLayout } from './root-layout';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

function withAccess(Page: RouteComponent, capability: Capability = 'workspace'): RouteComponent {
  function ReadonlyRoute() {
    return (
      <ProtectedRoute capability={capability}>
        <Page />
      </ProtectedRoute>
    );
  }
  // 权限包装保留 Router 的动态预加载入口；加载完成后沿用其清空行为，不让懒组件在渲染中才挂起。
  Object.defineProperty(ReadonlyRoute, 'preload', { get: () => Page.preload });
  return ReadonlyRoute;
}
// URL 参数只在 Feature 的公开 schema 边界解析，路由不补造 API 参数或默认数据。
const readonlySearch = (search: Record<string, unknown>) => search;
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: withAccess(lazyRouteComponent(() => import('@/features/dashboard/page'), 'DashboardPage')),
  validateSearch: readonlySearch,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({ returnTo: safeReturnTo(search.returnTo) }),
});
const forbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forbidden',
  component: ForbiddenPage,
});

const readonlyRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/accounts/page'), 'AccountsPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts/$id',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/accounts/detail-page'), 'AccountDetailPage'),
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/securities',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/securities/page'), 'SecuritiesPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/market',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/market/page'), 'MarketPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/orders',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/orders/page'), 'OrdersPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/orders/$id',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/orders/detail-page'), 'OrderDetailPage'),
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/tasks',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/tasks/page'), 'TasksPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/tasks/$id',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/tasks/detail-page'), 'TaskDetailPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/positions',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/positions/page'), 'PositionsPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/trades',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/trades/page'), 'TradesPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/ledger',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/ledger/page'), 'LedgerPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/reconciliations',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/reconciliations/page'), 'ReconciliationsPage'),
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/operations',
    validateSearch: readonlySearch,
    component: withAccess(lazyRouteComponent(() => import('@/features/operations/page'), 'OperationsPage')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/operations/$id',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/operations/detail-page'), 'OperationDetailPage'),
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/administration',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/administration/overview-page'), 'AdminOverviewPage'),
      'administration',
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/administration/users',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/administration/users-page'), 'UsersPage'),
      'administration',
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/administration/users/$id',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/administration/user-detail-page'), 'UserDetailPage'),
      'administration',
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/administration/accounts',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/accounts/page'), 'AccountsPage'),
      'administration',
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/administration/audit',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/administration/audit-page'), 'AuditPage'),
      'administration',
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/administration/system',
    validateSearch: readonlySearch,
    component: withAccess(
      lazyRouteComponent(() => import('@/features/administration/system-page'), 'SystemPage'),
      'administration',
    ),
  }),
] as const;

// 工程验证与能力探针仅开发注册，生产构建不导入其页面，也不提供假业务页面。
const developmentRoutes = import.meta.env.DEV
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/playground',
        component: lazyRouteComponent(() => import('@/routes/dev/playground-page'), 'PlaygroundPage'),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/access/$capability',
        component: lazyRouteComponent(() => import('@/routes/dev/access-probe-page'), 'AccessProbePage'),
      }),
    ]
  : [];

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    loginRoute,
    forbiddenRoute,
    ...readonlyRoutes,
    ...developmentRoutes,
  ]),
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 30_000,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
