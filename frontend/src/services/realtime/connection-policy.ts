const RETRY_DELAYS_MS = [3_000, 6_000, 12_000] as const;
const CONNECTION_WINDOW_MS = 60_000;
const CONNECTION_BUDGET = 4;

/** 只计算窗口/退避；调用者拥有连接、计时器与有限尝试记录，不引入第二个 SSE 管理器。 */
export function connectionBudget(
  attempts: readonly number[],
  now: number,
): {
  readonly expired: number;
  readonly retryAt: number | null;
} {
  let expired = 0;
  while (expired < attempts.length && now - (attempts[expired] ?? now) >= CONNECTION_WINDOW_MS) expired += 1;
  const first = attempts[expired];
  return {
    expired,
    retryAt:
      attempts.length - expired >= CONNECTION_BUDGET && first !== undefined
        ? first + CONNECTION_WINDOW_MS
        : null,
  };
}

export function automaticReconnectDelay(attempt: number): number | undefined {
  return RETRY_DELAYS_MS[attempt];
}
