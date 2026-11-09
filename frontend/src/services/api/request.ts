import { parseErrorEnvelope, parseSuccessEnvelope } from './response';
import type { ApiOutcome, ApiRequestOptions, TransportFailureReason } from './types';

const DEFAULT_TIMEOUT_MS = 20_000;

export interface RequestRuntimeConfig {
  readonly baseUrl: string;
  readonly getSessionEpoch: () => number;
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function buildHeaders(options: ApiRequestOptions): Headers {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.csrfToken) headers.set('X-CSRF-Token', options.csrfToken);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  return headers;
}

function transportFailure(reason: TransportFailureReason, message: string, sessionEpoch: number) {
  return { kind: 'transport-error', reason, message, sessionEpoch } as const;
}

function readBody(response: Response): Promise<string> {
  return response.text();
}

/**
 * 统一 Fetch 请求：
 * - 永不因 HTTP 非 2xx 抛异常，也不丢弃 `operation`；
 * - 写请求不在此处重试，重试策略由调用方显式决定；
 * - 超时与取消都归类为 transport-error（结果未知），不当作业务失败。
 */
export async function requestJson<T>(
  config: RequestRuntimeConfig,
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiOutcome<T>> {
  const sessionEpoch = config.getSessionEpoch();
  if (options.signal?.aborted) {
    return transportFailure('aborted', '请求已取消', sessionEpoch);
  }
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(buildUrl(config.baseUrl, path), {
      method: options.method ?? 'GET',
      headers: buildHeaders(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: options.credentials ?? 'include',
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await readBody(response);
    let body: unknown;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        return {
          kind: 'malformed',
          status: response.status,
          message: '响应不是合法 JSON，结果未知',
          body: text.slice(0, 2_000),
          operation: null,
          sessionEpoch,
        };
      }
    }

    if (!response.ok) {
      const parsed = parseErrorEnvelope(body);
      if (!parsed) {
        return {
          kind: 'malformed',
          status: response.status,
          message: '响应不符合公开错误契约，不能断言请求未被执行',
          body,
          operation: null,
          sessionEpoch,
        };
      }
      return {
        kind: 'http-error',
        status: response.status,
        error: parsed.error,
        operation: parsed.operation,
        sessionEpoch,
      };
    }

    const parsed = parseSuccessEnvelope<T>(body);
    if (!parsed) {
      return {
        kind: 'malformed',
        status: response.status,
        message: '成功响应缺少 data 字段',
        body,
        operation: null,
        sessionEpoch,
      };
    }
    return {
      kind: 'success',
      status: response.status,
      data: parsed.data,
      operation: parsed.operation,
      requestId: parsed.requestId,
      sessionEpoch,
    };
  } catch (error) {
    if (timedOut) {
      return transportFailure('timeout', `请求超过 ${timeoutMs} ms 未返回，结果未知`, sessionEpoch);
    }
    if (options.signal?.aborted) {
      return transportFailure('aborted', '请求已取消', sessionEpoch);
    }
    return transportFailure(
      'network',
      error instanceof Error ? error.message : '网络请求失败，结果未知',
      sessionEpoch,
    );
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}
