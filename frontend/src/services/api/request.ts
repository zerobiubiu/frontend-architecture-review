import { consumeJsonResponse } from './response';
import type { ApiOutcome, ApiRequestOptions, TransportFailureReason } from './types';

export interface RequestRuntimeConfig {
  readonly baseUrl: string;
  readonly getSessionEpoch: () => number;
  readonly getCsrfToken?: () => string | null;
  readonly getSessionSignal?: () => AbortSignal;
  readonly isSessionCurrent?: (epoch: number) => boolean;
  readonly onUnauthorized?: (epoch: number) => void;
  readonly defaultTimeoutMs?: number;
}

export interface JsonRequestOptions extends ApiRequestOptions {
  /** 认证由 Session Manager 串行协调；其他请求默认绑定会话取消信号和迟到响应门禁。 */
  readonly sessionBound?: boolean;
}

/** 隔离旧代副作用，同时保留已读取的原始结果和回执供原上下文核对，禁止向当前 UI 应用。 */
export class StaleSessionResponseError extends Error {
  readonly outcome: ApiOutcome<unknown>;

  constructor(outcome: ApiOutcome<unknown>) {
    super('旧会话响应已隔离');
    this.name = 'StaleSessionResponseError';
    this.outcome = outcome;
  }
}

function transportFailure(
  reason: TransportFailureReason,
  sessionEpoch: number,
  attempted: boolean,
): ApiOutcome<never> {
  return {
    kind: 'transport-error',
    reason,
    attempted,
    message:
      reason === 'timeout' ? '请求超时，结果未知' : attempted ? '请求未确认，结果未知' : '请求尚未发送',
    sessionEpoch,
  };
}

/** RPC 与字符串客户端共用：一次 Fetch、一次响应消费，截止时间覆盖响应体。 */
export async function executeJsonRequest<T>(
  config: RequestRuntimeConfig,
  invoke: (fetchOnce: typeof globalThis.fetch) => Promise<Response>,
  options: JsonRequestOptions = {},
): Promise<ApiOutcome<T>> {
  const epoch = config.getSessionEpoch();
  const sessionBound = options.sessionBound !== false;
  const finish = (outcome: ApiOutcome<T>): ApiOutcome<T> => {
    if (sessionBound && config.isSessionCurrent?.(epoch) === false) {
      throw new StaleSessionResponseError(outcome);
    }
    if (sessionBound && outcome.kind === 'http-error' && outcome.status === 401) {
      config.onUnauthorized?.(epoch);
    }
    return outcome;
  };
  if (options.signal?.aborted) return finish(transportFailure('aborted', epoch, false));

  const controller = new AbortController();
  let attempted = false;
  let timedOut = false;
  const linked: AbortSignal[] = [];
  const forwardAbort = () => controller.abort();
  const link = (signal?: AbortSignal) => {
    if (!signal || linked.includes(signal)) return;
    if (signal.aborted) controller.abort();
    else {
      signal.addEventListener('abort', forwardAbort, { once: true });
      linked.push(signal);
    }
  };
  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    options.timeoutMs ?? config.defaultTimeoutMs ?? 20_000,
  );

  const fetchOnce: typeof globalThis.fetch = async (input, init) => {
    link(init?.signal ?? undefined);
    if (input instanceof Request) link(input.signal);
    if (controller.signal.aborted) throw new DOMException('请求尚未发送', 'AbortError');
    if (attempted) throw new Error('一次逻辑调用不得重复发送请求');
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    const csrf = options.csrfToken === undefined ? config.getCsrfToken?.() : options.csrfToken;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrf) headers.set('X-CSRF-Token', csrf);
    else headers.delete('X-CSRF-Token');
    if (options.idempotencyKey !== undefined) headers.set('Idempotency-Key', options.idempotencyKey);
    attempted = true;
    return globalThis.fetch(input, {
      ...init,
      method,
      headers,
      signal: controller.signal,
      credentials: options.credentials ?? init?.credentials ?? 'include',
      cache: 'no-store',
    });
  };

  try {
    link(options.signal);
    if (sessionBound) link(config.getSessionSignal?.());
    if (controller.signal.aborted) return finish(transportFailure('aborted', epoch, false));
    // 保留项目 ES2023 运行目标；这里必须用 executor 安装可清理的 AbortSignal 回调。
    const interrupted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new DOMException('请求已取消', 'AbortError')),
        {
          once: true,
        },
      );
    });
    const response = await Promise.race([invoke(fetchOnce), interrupted]);
    const outcome = await Promise.race([consumeJsonResponse<T>(response, epoch), interrupted]);
    return finish(outcome);
  } catch (error) {
    if (error instanceof StaleSessionResponseError) throw error;
    return finish(
      transportFailure(
        timedOut ? 'timeout' : controller.signal.aborted ? 'aborted' : 'network',
        epoch,
        attempted,
      ),
    );
  } finally {
    clearTimeout(timeout);
    controller.abort();
    for (const signal of linked) signal.removeEventListener('abort', forwardAbort);
  }
}

/** 保留既有客户端入口；其传输及响应判断不再有独立实现。 */
export function requestJson<T>(
  config: RequestRuntimeConfig,
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiOutcome<T>> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  return executeJsonRequest<T>(
    config,
    (fetchOnce) =>
      fetchOnce(url, {
        method: options.method ?? 'GET',
        headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    options,
  );
}
