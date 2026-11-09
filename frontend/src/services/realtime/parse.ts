import { z } from 'zod';
import { BUSINESS_RESOURCES, type BusinessFrame, type BusinessResource } from './types';

const refreshSchema = z.looseObject({
  kind: z.literal('refresh'),
  resources: z.array(z.string()),
  at: z.string().nullish(),
  requestId: z.string().nullish(),
});

const errorSchema = z.looseObject({
  error: z.looseObject({
    code: z.string().min(1),
    message: z.string(),
    requestId: z.string().nullish(),
  }),
});

const resourceSet: Record<BusinessResource, true> = Object.fromEntries(
  BUSINESS_RESOURCES.map((name) => [name, true]),
) as Record<BusinessResource, true>;

/**
 * 解析业务流 data 帧。未知结构返回 null（调用方按“无提示”处理，不做猜测）。
 * 注意：帧 id 只是“毫秒-连接内计数”，不是可补播的持久游标。
 */
export function parseBusinessFrame(data: string): BusinessFrame | null {
  let body: unknown;
  try {
    body = JSON.parse(data);
  } catch {
    return null;
  }

  const refresh = refreshSchema.safeParse(body);
  if (refresh.success) {
    return {
      kind: 'refresh',
      resources: refresh.data.resources.filter((name): name is BusinessResource =>
        Object.hasOwn(resourceSet, name),
      ),
      at: refresh.data.at ?? null,
      requestId: refresh.data.requestId ?? null,
    };
  }

  const error = errorSchema.safeParse(body);
  if (error.success) {
    return {
      kind: 'error',
      code: error.data.error.code,
      message: error.data.error.message,
      requestId: error.data.error.requestId ?? null,
    };
  }

  return null;
}
