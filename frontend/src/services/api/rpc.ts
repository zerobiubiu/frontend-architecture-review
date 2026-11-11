import type { ApiClient } from '@project/api-contracts';
import { hc } from 'hono/client';
import type { ApiClientConfig } from './client';
import { executeJsonRequest, type JsonRequestOptions } from './request';
import type { ApiOutcome } from './types';

type ResponseData<Reply extends Response> =
  Awaited<ReturnType<Reply['json']>> extends { data: infer Data } ? Data : unknown;

export interface RpcApi {
  request<Reply extends Response>(
    invoke: (client: ApiClient) => Promise<Reply>,
    options?: JsonRequestOptions,
  ): Promise<ApiOutcome<ResponseData<Reply>>>;
  readonly eventsUrl: string;
}

/** 声明已包含 /api/v1；只在此将配置的旧 API 前缀转为 RPC 根，保留部署路径前缀。 */
export function rpcRootUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed;
}

export function createRpcApi(config: ApiClientConfig): RpcApi {
  const root = rpcRootUrl(config.baseUrl);
  const runtime = { ...config, getSessionEpoch: config.getSessionEpoch ?? (() => 0) };
  return {
    eventsUrl: `${root}/api/v1/events`,
    request: (invoke, options) =>
      executeJsonRequest(
        runtime,
        (fetchOnce) => {
          // hc 是动态代理；展开声明不是 AppType。类型绑定只在这个工厂，不在业务代码散布断言。
          const client = hc(root, { fetch: fetchOnce }) as unknown as ApiClient;
          return invoke(client);
        },
        options,
      ),
  };
}
