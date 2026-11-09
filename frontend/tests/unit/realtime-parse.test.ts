import { describe, expect, it } from 'vitest';
import { parseBusinessFrame } from '@/services/realtime/parse';

describe('业务 SSE 帧解析', () => {
  it('解析资源刷新提示并过滤未知资源', () => {
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
      resources: ['orders', 'ledger'],
      at: '2026-11-10T00:00:00.000Z',
      requestId: 'r1',
    });
  });

  it('解析错误帧（鉴权失败 HTTP 仍为 200）', () => {
    const frame = parseBusinessFrame(
      JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '会话失效', requestId: 'r2' } }),
    );
    expect(frame).toEqual({
      kind: 'error',
      code: 'UNAUTHENTICATED',
      message: '会话失效',
      requestId: 'r2',
    });
  });

  it('未知结构返回 null，不做猜测', () => {
    expect(parseBusinessFrame('not json')).toBeNull();
    expect(parseBusinessFrame(JSON.stringify({ kind: 'refresh' }))).toBeNull();
    expect(parseBusinessFrame(JSON.stringify({ foo: 1 }))).toBeNull();
  });
});
