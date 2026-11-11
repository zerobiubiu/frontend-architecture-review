import { onlineManager, type UseMutationOptions } from '@tanstack/react-query';

/**
 * 敏感写操作（交易、撤单、任务控制、账户/管理写入）的 fail-fast 门禁。
 *
 * TanStack Query v5 的 `networkMode: 'online'` 会在离线时暂停 mutation 并在恢复网络后继续，
 * 这与 `retry` 次数是不同机制；`retry:false` 不能阻止“恢复网络后自动首次发送”。
 * 因此敏感写操作必须：
 * 1) 使用 `networkMode: 'always'`，让本次调用立即执行门禁，而不是进入暂停队列；
 * 2) 在真正调用 Fetch 前再次核对联网状态、会话代次、目标账户与用户确认是否仍有效；
 * 3) 不持久化、不恢复、不重放敏感 mutation；
 * 4) 请求一旦可能发出，超时/取消仍按未知结果处理（由 API Client 保证）。
 */
export type SensitiveWriteBlockedReason =
  | 'offline'
  | 'session-changed'
  | 'account-changed'
  | 'confirmation-invalid';

export class SensitiveWriteBlockedError extends Error {
  readonly reason: SensitiveWriteBlockedReason;

  constructor(reason: SensitiveWriteBlockedReason) {
    super(`敏感写操作已在发送前阻止：${reason}`);
    this.name = 'SensitiveWriteBlockedError';
    this.reason = reason;
  }
}

export interface SensitiveWriteIntent {
  /** 用户本次明确确认的标识；恢复网络不构成新的确认。 */
  readonly confirmationId: string;
  /** 用户确认时所在的会话代次。 */
  readonly expectedSessionEpoch: number;
  /** 用户确认时选定的目标账户。 */
  readonly expectedAccountId: string;
}

export interface SensitiveWriteContext {
  readonly isOnline: () => boolean;
  readonly getSessionEpoch: () => number;
  readonly getAccountId: () => string | null;
  readonly isConfirmationCurrent: (confirmationId: string) => boolean;
}

export type GateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: SensitiveWriteBlockedReason };

export interface SensitiveWriteGate {
  check(intent: SensitiveWriteIntent): GateDecision;
  /** 只有门禁通过后才调用 send；send 内部才允许真正发 Fetch。 */
  run<T>(intent: SensitiveWriteIntent, send: () => Promise<T>): Promise<T>;
}

export function createSensitiveWriteGate(context: SensitiveWriteContext): SensitiveWriteGate {
  const check = (intent: SensitiveWriteIntent): GateDecision => {
    if (!context.isOnline()) return { allowed: false, reason: 'offline' };
    if (context.getSessionEpoch() !== intent.expectedSessionEpoch) {
      return { allowed: false, reason: 'session-changed' };
    }
    if (context.getAccountId() !== intent.expectedAccountId) {
      return { allowed: false, reason: 'account-changed' };
    }
    if (!context.isConfirmationCurrent(intent.confirmationId)) {
      return { allowed: false, reason: 'confirmation-invalid' };
    }
    return { allowed: true };
  };

  return {
    check,
    async run<T>(intent: SensitiveWriteIntent, send: () => Promise<T>): Promise<T> {
      const decision = check(intent);
      if (!decision.allowed) throw new SensitiveWriteBlockedError(decision.reason);
      return send();
    },
  };
}

/** 默认上下文：只依赖 TanStack Query 的 OnlineManager；会话与确认需调用方注入。 */
export function createOnlineSensitiveWriteContext(overrides: {
  readonly getSessionEpoch: () => number;
  readonly getAccountId: () => string | null;
  readonly isConfirmationCurrent: (confirmationId: string) => boolean;
}): SensitiveWriteContext {
  return { isOnline: () => onlineManager.isOnline(), ...overrides };
}

export interface SensitiveMutationOptions<TData, TVariables> {
  readonly gate: SensitiveWriteGate;
  readonly intent: (variables: TVariables) => SensitiveWriteIntent;
  readonly mutationFn: (variables: TVariables) => Promise<TData>;
}

/**
 * 为 useMutation 生成敏感写选项：`networkMode:'always'` + `retry:false` + 发送前门禁。
 * 离线调用会立即失败且不发起 Fetch；恢复网络不会自动重放，必须由用户重新确认后再次调用。
 */
export function createSensitiveMutationOptions<TData, TVariables>({
  gate,
  intent,
  mutationFn,
}: SensitiveMutationOptions<TData, TVariables>): UseMutationOptions<TData, Error, TVariables, unknown> {
  return {
    networkMode: 'always',
    retry: false,
    mutationFn: (variables) => gate.run(intent(variables), () => mutationFn(variables)),
  };
}
