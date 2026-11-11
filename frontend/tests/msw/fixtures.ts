import type { OriginalOperationIdentity } from '@/services/api/errors';
import type { OperationReceipt, OperationStatus } from '@/services/api/types';

export const ORDER_CANCEL_REQUEST = {
  id: '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e6f',
  kind: 'ORDER_CANCEL',
  targetType: 'ORDER',
  targetId: 'order-1',
} as const satisfies OriginalOperationIdentity;

export const ACCOUNT_SYNC_REQUEST = {
  id: '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e70',
  kind: 'ACCOUNT_SYNC',
  targetType: 'ACCOUNT',
  targetId: 'account-1',
} as const satisfies OriginalOperationIdentity;

export const TASK_CONTROL_REQUEST = {
  id: '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e71',
  kind: 'TASK_CONTROL',
  targetType: 'TASK',
  targetId: 'task-1',
} as const satisfies OriginalOperationIdentity;

export const ACCOUNT_RECONCILE_REQUEST = {
  id: '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e72',
  kind: 'ACCOUNT_RECONCILE',
  targetType: 'ACCOUNT',
  targetId: 'account-1',
} as const satisfies OriginalOperationIdentity;

export interface ReceiptOverrides {
  readonly id?: string;
  readonly kind?: string;
  readonly targetType?: string | null;
  readonly targetId?: string | null;
  readonly status?: OperationStatus;
  readonly phase?: string | null;
  readonly result?: Record<string, unknown> | null;
}

/** 必须先提供发送前确定的请求身份，负例仅通过覆盖字段构造。 */
export function receipt(
  identity: OriginalOperationIdentity,
  overrides: ReceiptOverrides = {},
): OperationReceipt {
  return {
    ...identity,
    status: 'SUCCEEDED',
    phase: 'execute',
    outcome: null,
    actorUserId: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:01.000Z',
    finishedAt: '2026-11-10T00:00:01.000Z',
    result: null,
    error: null,
    raw: null,
    ...overrides,
  };
}

/** 线上回执的原始 JSON 形状（带 actuator 字段），用于验证解析而不是直接复用类型。 */
export function receiptJson(
  identity: OriginalOperationIdentity,
  overrides: ReceiptOverrides = {},
): Record<string, unknown> {
  return {
    ...identity,
    actorUserId: '00000000-0000-4000-8000-000000000001',
    status: 'SUCCEEDED',
    phase: 'execute',
    outcome: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:01.000Z',
    finishedAt: '2026-11-10T00:00:01.000Z',
    result: null,
    error: null,
    ...overrides,
  };
}
