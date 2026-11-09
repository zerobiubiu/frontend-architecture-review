import type { OperationReceipt, OperationStatus } from '@/services/api/types';

export interface ReceiptOverrides {
  readonly id?: string;
  readonly kind?: string;
  readonly status?: OperationStatus;
  readonly phase?: string | null;
  readonly result?: Record<string, unknown> | null;
}

/** 构造与后端 operationReceiptSchema 同形的最小回执。 */
export function receipt(overrides: ReceiptOverrides = {}): OperationReceipt {
  return {
    id: overrides.id ?? '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e6f',
    kind: overrides.kind ?? 'ORDER_CANCEL',
    status: overrides.status ?? 'SUCCEEDED',
    phase: overrides.phase ?? 'execute',
    outcome: null,
    targetType: 'ORDER',
    targetId: 'order-1',
    actorUserId: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:01.000Z',
    finishedAt: '2026-11-10T00:00:01.000Z',
    result: overrides.result ?? null,
    error: null,
    raw: null,
  };
}

/** 线上回执的原始 JSON 形状（带 actuator 字段），用于验证解析而不是直接复用类型。 */
export function receiptJson(overrides: ReceiptOverrides = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e6f',
    actorUserId: '00000000-0000-4000-8000-000000000001',
    kind: overrides.kind ?? 'ORDER_CANCEL',
    targetType: 'ORDER',
    targetId: 'order-1',
    status: overrides.status ?? 'SUCCEEDED',
    phase: overrides.phase ?? 'execute',
    outcome: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:01.000Z',
    finishedAt: '2026-11-10T00:00:01.000Z',
    result: overrides.result ?? null,
    error: null,
  };
}
