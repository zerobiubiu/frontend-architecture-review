import type { z } from 'zod';
import { ApiOutcomeError, requireData } from '@/services/api/errors';
import type { ApiOutcome } from '@/services/api/types';

export class ReadContractError extends Error {
  constructor(paths: readonly string[]) {
    super(`服务端数据无法按只读展示契约解释：${paths.join('、') || '响应结构'}`);
    this.name = 'ReadContractError';
  }
}

/** 静态 RPC 类型之外的唯一消费边界；只暴露字段路径，不附带原响应或输入值。 */
export function parseReadOutcome<T>(outcome: ApiOutcome<unknown>, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(requireData(outcome));
  if (!parsed.success) {
    throw new ReadContractError(parsed.error.issues.slice(0, 5).map((issue) => issue.path.join('.')));
  }
  return parsed.data;
}

/** 访问拒绝/对象未取得不能继续展示旧敏感数据，也不应自动重复读取。 */
export function isReadAccessError(error: unknown): boolean {
  return (
    error instanceof ApiOutcomeError &&
    error.outcome.kind === 'http-error' &&
    [401, 403, 404].includes(error.outcome.status)
  );
}
