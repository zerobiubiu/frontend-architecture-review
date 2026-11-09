import { QueryClient } from '@tanstack/react-query';
import { ApiOutcomeError, isRetryableReadFailure } from '@/services/api/errors';

/**
 * 统一 QueryClient 默认值：
 * - 读：30s 内视为新鲜；窗口聚焦重取（金融数据以服务端为准）；
 * - 读失败：仅网络/429/5xx 最多重试 2 次；
 * - 写：永不自动重试（任何交易副作用都必须由原操作标识人工/流程核对）。
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) =>
          failureCount < 2 && error instanceof ApiOutcomeError && isRetryableReadFailure(error.outcome),
      },
      mutations: {
        retry: false,
        networkMode: 'online',
      },
    },
  });
}
