import { type QueryKey, skipToken, type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useMemo } from 'react';
import { useAppServices, useSession } from '@/app/runtime-context';
import type { AuthUser } from '@/features/auth/types';
import { isReadAccessError } from '@/lib/read-only/response';
import type { BusinessResource } from '@/services/realtime/types';
import { matchesScope, type QueryKeyScope } from './query-convergence';

export interface ResourceQueryOptions<T> {
  readonly queryKey: QueryKey;
  readonly resource: BusinessResource;
  readonly dependencies?: readonly BusinessResource[];
  readonly accountId: string | null;
  readonly canRead: (user: AuthUser) => boolean;
  readonly enabled?: boolean;
  readonly queryFn: (signal: AbortSignal) => Promise<T>;
}

/** 拒绝随精确缓存条目保留；普通网络失败不能重新证明访问权，缓存回收后自然释放。 */
const accessDenials = new WeakMap<object, Error>();

/** 只派生键元数据，身份仍由 Session Manager 唯一拥有。 */
export function useQueryScope(): QueryKeyScope {
  const snapshot = useSession();
  return useMemo(
    () => ({ epoch: snapshot.epoch, user: snapshot.status === 'authenticated' ? snapshot.user : null }),
    [snapshot.epoch, snapshot.status, snapshot.user],
  );
}

/** Feature 只提供自己的 key/API/授权；缓存与旧代取消仍使用已有唯一基础设施。 */
export function useResourceQuery<T>(options: ResourceQueryOptions<T>): UseQueryResult<T, Error> {
  const { queryClient, convergence } = useAppServices();
  const scope = useQueryScope();
  const user = scope.user;
  const permitted = Boolean(
    user && options.canRead(user) && matchesScope(options.queryKey, { epoch: scope.epoch, user }, options),
  );
  const enabled = permitted && options.enabled !== false;
  const cache = queryClient.getQueryCache();
  const cached = cache.find({ queryKey: options.queryKey, exact: true });
  const denial = cached ? accessDenials.get(cached) : undefined;
  const query = useQuery<T, Error>({
    queryKey: options.queryKey,
    queryFn: enabled
      ? async ({ signal }) => {
          const current = cache.find({ queryKey: options.queryKey, exact: true });
          try {
            const data = await options.queryFn(signal);
            if (current) accessDenials.delete(current);
            return data;
          } catch (error) {
            if (current && error instanceof Error && isReadAccessError(error))
              accessDenials.set(current, error);
            throw error;
          }
        }
      : skipToken,
    // 只有显式核对成功才能清除拒绝；失败、重新挂载或普通刷新均不能恢复自动读取。
    enabled: enabled && !denial,
    placeholderData: undefined,
  });
  const { resource, accountId, canRead, dependencies, queryKey } = options;

  useLayoutEffect(() => {
    if (!enabled) return;
    const unregister = convergence.register({
      resource,
      queryKey,
      accountId,
      canRead: (currentUser) => {
        const current = queryClient.getQueryCache().find({ queryKey, exact: true });
        return (
          canRead(currentUser) &&
          (!current || !accessDenials.has(current) || current.state.fetchStatus === 'fetching')
        );
      },
      ...(dependencies ? { dependencies } : {}),
      retainWhileCached: true,
    });
    return () => {
      unregister();
      // 账户/筛选切换后不复用新鲜标记；StrictMode 同刻重挂载及仍有消费者时不触发额外读取。
      queueMicrotask(() => {
        const previous = queryClient.getQueryCache().find({ queryKey, exact: true });
        if (previous && !previous.isActive()) previous.invalidate();
      });
    };
  }, [enabled, convergence, queryClient, queryKey, resource, accountId, canRead, dependencies]);

  if (!denial) return query;
  return {
    ...query,
    data: undefined,
    error: denial,
    status: 'error',
    isError: true,
    isSuccess: false,
    isPending: false,
    isLoading: false,
    isInitialLoading: false,
    isLoadingError: true,
    isRefetchError: false,
    isPlaceholderData: false,
  };
}
