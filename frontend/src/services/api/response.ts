import { z } from 'zod';
import type { ApiErrorBody, OperationReceipt, OperationStatus } from './types';

const operationStatuses = ['PROCESSING', 'SUCCEEDED', 'REJECTED', 'UNKNOWN', 'CONFLICT'] as const;

/**
 * 宽松解析：只收窄用于识别与恢复的字段，不因后端新增字段失败。
 * 缺字段填 null，绝不补造状态或结果。
 */
const operationReceiptSchema = z.looseObject({
  id: z.string().min(1),
  actorUserId: z.string().min(1).nullish(),
  kind: z.string().min(1),
  targetType: z.string().min(1).nullish(),
  targetId: z.string().min(1).nullish(),
  status: z.enum(operationStatuses),
  phase: z.string().nullish(),
  outcome: z.string().nullish(),
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  finishedAt: z.string().nullish(),
  result: z.record(z.string(), z.unknown()).nullish(),
  error: z.object({ code: z.string(), message: z.string() }).nullish(),
});

const errorEnvelopeSchema = z.looseObject({
  error: z.looseObject({
    code: z.string().min(1),
    message: z.string(),
    requestId: z.string().nullish(),
    operationAccepted: z.literal(false).optional(),
    details: z.unknown().optional(),
  }),
  operation: z.unknown().optional(),
});

/** 无法识别时返回 null，让上层按“未知”处理，而不是猜测状态。 */
export function parseOperation(value: unknown): OperationReceipt | null {
  if (value === null || value === undefined) return null;
  const parsed = operationReceiptSchema.safeParse(value);
  if (!parsed.success) return null;
  const data = parsed.data;
  return {
    id: data.id,
    kind: data.kind,
    status: data.status satisfies OperationStatus,
    phase: data.phase ?? null,
    outcome: data.outcome ?? null,
    targetType: data.targetType ?? null,
    targetId: data.targetId ?? null,
    actorUserId: data.actorUserId ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    finishedAt: data.finishedAt ?? null,
    result: data.result ?? null,
    error: data.error ?? null,
    raw: value,
  };
}

export interface ParsedErrorEnvelope {
  readonly error: ApiErrorBody;
  readonly operation: OperationReceipt | null;
}

export function parseErrorEnvelope(body: unknown): ParsedErrorEnvelope | null {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (!parsed.success) return null;
  const error: ApiErrorBody = {
    code: parsed.data.error.code,
    message: parsed.data.error.message,
    requestId: parsed.data.error.requestId ?? null,
    ...(parsed.data.error.operationAccepted === false ? { operationAccepted: false as const } : {}),
    ...(parsed.data.error.details === undefined ? {} : { details: parsed.data.error.details }),
  };
  return { error, operation: parseOperation(parsed.data.operation) };
}

export interface ParsedSuccessEnvelope<T> {
  readonly data: T;
  readonly operation: OperationReceipt | null;
  readonly requestId: string | null;
}

/** 成功响应必须带 `data`；缺失即视为结构不符合协议。 */
export function parseSuccessEnvelope<T>(body: unknown): ParsedSuccessEnvelope<T> | null {
  if (typeof body !== 'object' || body === null || !('data' in body)) return null;
  const record = body as Record<string, unknown>;
  return {
    data: record.data as T,
    operation: parseOperation(record.operation),
    requestId: typeof record.requestId === 'string' ? record.requestId : null,
  };
}
