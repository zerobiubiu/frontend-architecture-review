import { z } from 'zod';
import {
  type ApiErrorBody,
  type ApiOutcome,
  OPERATION_KINDS,
  OPERATION_STATUSES,
  OPERATION_TARGET_TYPES,
  type OperationReceipt,
  type ReceiptParse,
} from './types';

/**
 * 宽松解析：只收窄用于识别与恢复的字段，不因后端新增字段失败。
 * 缺字段填 null，绝不补造状态或结果；未知 kind/status 视为 invalid 而不是 absent。
 */
const operationReceiptSchema = z.looseObject({
  id: z.string().min(1),
  actorUserId: z.string().min(1).nullish(),
  kind: z.enum(OPERATION_KINDS),
  targetType: z.enum(OPERATION_TARGET_TYPES).nullish(),
  targetId: z.string().min(1).nullish(),
  status: z.enum(OPERATION_STATUSES),
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

function parseOperationReceipt(value: unknown): OperationReceipt {
  const parsed = operationReceiptSchema.parse(value);
  return {
    id: parsed.id,
    kind: parsed.kind,
    status: parsed.status,
    phase: parsed.phase ?? null,
    outcome: parsed.outcome ?? null,
    targetType: parsed.targetType ?? null,
    targetId: parsed.targetId ?? null,
    actorUserId: parsed.actorUserId ?? null,
    createdAt: parsed.createdAt ?? null,
    updatedAt: parsed.updatedAt ?? null,
    finishedAt: parsed.finishedAt ?? null,
    result: parsed.result ?? null,
    error: parsed.error ?? null,
    raw: value,
  };
}

/** 区分 absent / valid / invalid，调用方不得把 invalid 当 absent。 */
export function parseReceipt(value: unknown): ReceiptParse {
  if (value === null || value === undefined) return { kind: 'absent' };
  const parsed = operationReceiptSchema.safeParse(value);
  if (!parsed.success) {
    return {
      kind: 'invalid',
      raw: value,
      reason: parsed.error.issues[0]?.message ?? 'operation-invalid',
    };
  }
  return { kind: 'valid', receipt: parseOperationReceipt(value) };
}

/** 从任意信封对象中独立取出 operation 字段，供错误信封损坏时保留诊断线索。 */
export function parseReceiptFromEnvelope(body: unknown): ReceiptParse {
  if (typeof body !== 'object' || body === null || !('operation' in body)) {
    return { kind: 'absent' };
  }
  return parseReceipt((body as Record<string, unknown>).operation);
}

export interface ParsedErrorEnvelope {
  readonly error: ApiErrorBody;
  readonly receipt: ReceiptParse;
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
  return { error, receipt: parseReceiptFromEnvelope(body) };
}

export interface ParsedDataEnvelope<T> {
  readonly data: T;
  readonly receipt: ReceiptParse;
  readonly requestId: string | null;
}

/** 读取带 `data` 的信封（不判断 HTTP 状态；失败/降级响应也可能携带 data）。 */
export function parseDataEnvelope<T>(body: unknown): ParsedDataEnvelope<T> | null {
  if (typeof body !== 'object' || body === null || !('data' in body)) return null;
  const record = body as Record<string, unknown>;
  return {
    data: record.data as T,
    receipt: parseReceipt(record.operation),
    requestId: typeof record.requestId === 'string' ? record.requestId : null,
  };
}

/** 成功响应必须带 `data`；缺失即视为结构不符合协议。 */
export const parseSuccessEnvelope = parseDataEnvelope;

/** 同一响应只读取一次；RPC 与既有请求入口共同消费此协议边界。 */
export async function consumeJsonResponse<T>(
  response: Response,
  sessionEpoch: number,
): Promise<ApiOutcome<T>> {
  const text = await response.text();
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
        receipt: { kind: 'absent' },
        sessionEpoch,
      };
    }
  }
  if (!response.ok) {
    const parsedError = parseErrorEnvelope(body);
    if (parsedError) {
      return {
        kind: 'http-error',
        status: response.status,
        error: parsedError.error,
        receipt: parsedError.receipt,
        sessionEpoch,
      };
    }
    const parsedData = parseDataEnvelope<T>(body);
    if (parsedData) {
      return {
        kind: 'http-data',
        status: response.status,
        data: parsedData.data,
        receipt: parsedData.receipt,
        requestId: parsedData.requestId,
        sessionEpoch,
      };
    }
    return {
      kind: 'malformed',
      status: response.status,
      message: '响应不符合公开错误契约，不能断言请求未被执行',
      body,
      receipt: parseReceiptFromEnvelope(body),
      sessionEpoch,
    };
  }
  const parsed = parseDataEnvelope<T>(body);
  if (!parsed) {
    return {
      kind: 'malformed',
      status: response.status,
      message: '成功响应缺少 data 字段',
      body,
      receipt: parseReceiptFromEnvelope(body),
      sessionEpoch,
    };
  }
  return {
    kind: 'success',
    status: response.status,
    data: parsed.data,
    receipt: parsed.receipt,
    requestId: parsed.requestId,
    sessionEpoch,
  };
}
