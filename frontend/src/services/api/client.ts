import { type RequestRuntimeConfig, requestJson } from './request';
import type { ApiOutcome, ApiRequestOptions } from './types';

export interface ApiClientConfig {
  /** 同源用 `/api/v1`，跨源用公开 HTTPS origin。 */
  readonly baseUrl: string;
  /** 会话绑定的 CSRF Token 提供者；仅写请求读取。 */
  readonly getCsrfToken?: () => string | null;
  /** 会话纪元；用于丢弃旧会话的迟到响应。默认恒为 0。 */
  readonly getSessionEpoch?: () => number;
  readonly defaultTimeoutMs?: number;
  readonly getSessionSignal?: () => AbortSignal;
  readonly isSessionCurrent?: (epoch: number) => boolean;
  readonly onUnauthorized?: (epoch: number) => void;
}

export interface WriteRequestOptions extends Omit<ApiRequestOptions, 'method' | 'body' | 'csrfToken'> {
  /** 显式覆盖 CSRF；默认从 config.getCsrfToken() 读取。 */
  readonly csrfToken?: string | null;
}

export interface ApiClient {
  readonly baseUrl: string;
  request<T>(path: string, options?: ApiRequestOptions): Promise<ApiOutcome<T>>;
  get<T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiOutcome<T>>;
  post<T>(path: string, body: unknown, options?: WriteRequestOptions): Promise<ApiOutcome<T>>;
  patch<T>(path: string, body: unknown, options?: WriteRequestOptions): Promise<ApiOutcome<T>>;
}

/**
 * 统一 API Client 骨架。
 *
 * - 只做一次 fetch：任何写请求都不自动重试（P0 门禁）；
 * - 非 2xx 返回结构化 outcome，`operation` 原样保留；
 * - 超时/断网返回 transport-error，由调用方按“未知结果”处理；
 * - 本阶段不连接真实后端，只用于 Mock 测试与后续注入。
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const runtime: RequestRuntimeConfig = {
    ...config,
    getSessionEpoch: config.getSessionEpoch ?? (() => 0),
  };

  const request = <T>(path: string, options: ApiRequestOptions = {}): Promise<ApiOutcome<T>> =>
    requestJson<T>(runtime, path, options);

  return {
    baseUrl: config.baseUrl,
    request,
    get: <T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) =>
      request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body: unknown, options: WriteRequestOptions = {}) =>
      request<T>(path, {
        ...options,
        method: 'POST',
        body,
      }),
    patch: <T>(path: string, body: unknown, options: WriteRequestOptions = {}) =>
      request<T>(path, {
        ...options,
        method: 'PATCH',
        body,
      }),
  };
}

/** 默认 API 前缀；未配置时按同源相对路径处理。 */
export const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
