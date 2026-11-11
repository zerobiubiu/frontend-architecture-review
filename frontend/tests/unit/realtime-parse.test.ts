import { describe, expect, it } from 'vitest';
import { parseBusinessFrame } from '@/services/realtime/parse';
import { BUSINESS_RESOURCES } from '@/services/realtime/types';

describe('业务 SSE 帧解析', () => {
  it('显式 resources 只刷新声明资源，并保留未知资源名', () => {
    const frame = parseBusinessFrame(
      JSON.stringify({
        kind: 'refresh',
        resources: ['orders', 'unknown', 'ledger'],
        at: '2026-11-10T00:00:00.000Z',
        requestId: 'r1',
      }),
    );
    expect(frame).toEqual({
      kind: 'refresh',
      scope: 'declared',
      resources: ['orders', 'ledger'],
      unknownResources: ['unknown'],
      at: '2026-11-10T00:00:00.000Z',
      requestId: 'r1',
    });
  });

  it('缺省 resources 是一次有界全量收敛，而不是“没有变化”', () => {
    const frame = parseBusinessFrame(JSON.stringify({ kind: 'refresh', requestId: 'r2' }));
    expect(frame).toEqual({
      kind: 'refresh',
      scope: 'all',
      resources: BUSINESS_RESOURCES,
      unknownResources: [],
      at: null,
      requestId: 'r2',
    });
  });

  it('显式空 resources 表示确定无变化', () => {
    const frame = parseBusinessFrame(JSON.stringify({ kind: 'refresh', resources: [] }));
    expect(frame).toEqual({
      kind: 'refresh',
      scope: 'declared',
      resources: [],
      unknownResources: [],
      at: null,
      requestId: null,
    });
  });

  it('解析错误帧（鉴权失败 HTTP 仍为 200）', () => {
    const frame = parseBusinessFrame(
      JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '会话失效', requestId: 'r3' } }),
    );
    expect(frame).toEqual({
      kind: 'error',
      code: 'UNAUTHENTICATED',
      message: '会话失效',
      requestId: 'r3',
    });
  });

  it('畸形帧是 invalid，不能触发全站刷新', () => {
    expect(parseBusinessFrame('not json')).toMatchObject({ kind: 'invalid', reason: 'not-json' });
    expect(parseBusinessFrame(JSON.stringify({ kind: 'refresh', resources: 'orders' }))).toMatchObject({
      kind: 'invalid',
      reason: 'unrecognized-frame',
    });
    expect(parseBusinessFrame(JSON.stringify({ foo: 1 }))).toMatchObject({
      kind: 'invalid',
      reason: 'unrecognized-frame',
    });
  });
});
