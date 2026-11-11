import { z } from 'zod';
import { BUSINESS_RESOURCES, type BusinessFrame, type BusinessResource } from './types';

const refreshSchema = z.looseObject({
  kind: z.literal('refresh'),
  // 后端事件 schema 中 resources 允许缺省；缺省时按一次有界全量收敛处理。
  resources: z.array(z.string()).optional(),
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

function isKnownResource(name: string): name is BusinessResource {
  return Object.hasOwn(resourceSet, name);
}

/**
 * 解析业务流 data 帧。
 *
 * - refresh 且缺省 resources：`scope:'all'`，收敛到全部已知资源（一次有界信号）；
 * - refresh 且 resources 为数组：只返回已知资源；空数组表示确定无变化；
 * - 未知资源名保留在 `unknownResources`，不伪装成已知资源；
 * - error 帧保留错误信息；
 * - 其余返回 invalid，调用方不得据此触发刷新。
 *
 * 注意：帧 id 只是“毫秒-连接内计数”，不是可补播的持久游标。
 */
export function parseBusinessFrame(data: string): BusinessFrame {
  let body: unknown;
  try {
    body = JSON.parse(data);
  } catch {
    return { kind: 'invalid', reason: 'not-json', raw: data.slice(0, 500) };
  }

  const refresh = refreshSchema.safeParse(body);
  if (refresh.success) {
    if (refresh.data.resources === undefined) {
      return {
        kind: 'refresh',
        scope: 'all',
        resources: BUSINESS_RESOURCES,
        unknownResources: [],
        at: refresh.data.at ?? null,
        requestId: refresh.data.requestId ?? null,
      };
    }
    const known: BusinessResource[] = [];
    const unknown: string[] = [];
    for (const name of refresh.data.resources) {
      if (isKnownResource(name)) known.push(name);
      else unknown.push(name);
    }
    return {
      kind: 'refresh',
      scope: 'declared',
      resources: known,
      unknownResources: unknown,
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

  return { kind: 'invalid', reason: 'unrecognized-frame', raw: data.slice(0, 500) };
}
