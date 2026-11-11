import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncSession } from '@/app/business-sync/query-convergence';
import { selectMarketQuote } from '@/features/market/quote-selection';
import type { BusinessEventSource, BusinessEventSourceFactory } from '@/services/realtime/manager';
import { MARKET_DISPLAY_REFERENCE_MS, MarketQuoteStore } from '@/services/realtime/market-quotes';
import { TRADER_USER } from '../msw/auth-fixtures';
import { READONLY_IDS } from '../msw/readonly/ids';
import {
  MARKET_FIXTURE_TIME,
  makeMarketQuote,
  makeQuoteEvent,
  makeQuoteStatus,
} from '../msw/readonly/market';

class Source implements BusinessEventSource {
  onopen: BusinessEventSource['onopen'] = null;
  onmessage: BusinessEventSource['onmessage'] = null;
  onerror: BusinessEventSource['onerror'] = null;
  closed = false;
  readonly url: string;
  readonly options: { readonly withCredentials: true };
  constructor(url: string, options: { readonly withCredentials: true }) {
    this.url = url;
    this.options = options;
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.(new Event('open'));
  }
  frame(value: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(value) }));
  }
  error(): void {
    this.onerror?.(new Event('error'));
  }
}

const SESSION: SyncSession = { epoch: 1, user: TRADER_USER };
const SELECTION = { accountId: READONLY_IDS.accountA, symbol: 'AAPL' };
const cleanups: Array<() => void> = [];

function harness(initial: SyncSession | null = SESSION) {
  const state = { session: initial };
  const sources: Source[] = [];
  let maximumConcurrent = 0;
  const createEventSource = vi.fn<BusinessEventSourceFactory>((url, options) => {
    const source = new Source(url, options);
    sources.push(source);
    maximumConcurrent = Math.max(maximumConcurrent, sources.filter((item) => !item.closed).length);
    return source;
  });
  const onUnauthorized = vi.fn<(epoch: number) => void>();
  const store = new MarketQuoteStore({
    url: 'https://mock.example/prefix/api/v1/events',
    getSession: () => state.session,
    onUnauthorized,
    createEventSource,
  });
  cleanups.push(() => store.stop());
  function latest(): Source {
    const source = sources.at(-1);
    if (!source) throw new Error('测试尚未建立报价流');
    return source;
  }
  function start() {
    store.setSubscription(SELECTION);
    store.start();
  }
  return {
    state,
    sources,
    createEventSource,
    onUnauthorized,
    store,
    latest,
    start,
    maximumConcurrent: () => maximumConcurrent,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(MARKET_FIXTURE_TIME));
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('唯一报价流的作用域与原生协议', () => {
  it('构造无副作用、未认证或无选择不建连，稳定快照和订阅可注销', () => {
    const h = harness(null);
    const initial = h.store.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = h.store.subscribe(listener);
    expect(h.store.getSnapshot()).toBe(initial);
    expect(h.createEventSource).not.toHaveBeenCalled();
    h.store.start();
    h.store.start();
    expect(h.store.getSnapshot()).toBe(initial);
    expect(vi.getTimerCount()).toBe(0);
    h.store.setSubscription(SELECTION);
    expect(h.createEventSource).not.toHaveBeenCalled();
    h.state.session = SESSION;
    h.store.reconcile();
    expect(h.sources).toHaveLength(1);
    expect(h.latest().options.withCredentials).toBe(true);
    const count = listener.mock.calls.length;
    unsubscribe();
    h.latest().open();
    expect(listener).toHaveBeenCalledTimes(count);
  });

  it('同根部署前缀、单证券编码和原生 Cookie 工厂均遵守公开协议', () => {
    const sources: Source[] = [];
    class NativeSource extends Source {
      constructor(url: string, options: { readonly withCredentials: true }) {
        super(url, options);
        sources.push(this);
      }
    }
    vi.stubGlobal('EventSource', NativeSource);
    const store = new MarketQuoteStore({
      url: '/prefix/api/v1/events',
      getSession: () => SESSION,
      onUnauthorized: vi.fn(),
    });
    cleanups.push(() => store.stop());
    store.setSubscription({ accountId: READONLY_IDS.accountA, symbol: ' brk.b ' });
    store.start();
    store.setSubscription({ accountId: READONLY_IDS.accountA, symbol: 'BRK.B' });
    expect(sources).toHaveLength(1);
    const url = new URL(sources[0]?.url ?? '', 'https://mock.example');
    expect(url.pathname).toBe('/prefix/api/v1/market/quote-stream');
    expect([...url.searchParams.keys()]).toEqual(['accountId', 'symbol']);
    expect(url.searchParams.get('symbol')).toBe('BRK.B');
    expect(sources[0]?.options).toEqual({ withCredentials: true });
  });

  it('open 和重复 live 状态都不伪造报价或刷新参考时钟', async () => {
    const h = harness();
    h.start();
    h.latest().open();
    h.latest().frame(makeQuoteStatus('live', { retryable: true }));
    expect(h.store.getSnapshot()).toMatchObject({
      status: 'open',
      quote: null,
      observedAt: null,
      stale: true,
    });
    h.latest().frame(makeQuoteEvent());
    const observedAt = h.store.getSnapshot().observedAt;
    await vi.advanceTimersByTimeAsync(MARKET_DISPLAY_REFERENCE_MS - 1);
    h.latest().frame(makeQuoteStatus('live', { retryable: true }));
    expect(h.store.getSnapshot().stale).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.store.getSnapshot()).toMatchObject({ observedAt, stale: true });
  });

  it('选择或 epoch 变化立即清旧价，保存的旧实例回调也不能跨代泄漏', () => {
    const h = harness();
    h.start();
    const first = h.latest();
    const late = first.onmessage;
    first.frame(makeQuoteEvent());
    h.store.setSubscription({ accountId: READONLY_IDS.accountB, symbol: 'MSFT' });
    expect(first.closed).toBe(true);
    expect(h.store.getSnapshot().quote).toBeNull();
    late?.(new MessageEvent('message', { data: JSON.stringify(makeQuoteEvent()) }));
    expect(h.store.getSnapshot().quote).toBeNull();
    h.latest().frame(makeQuoteEvent({ accountId: READONLY_IDS.accountB, symbol: 'MSFT' }));
    const secondLate = h.latest().onmessage;
    h.state.session = { ...SESSION, epoch: 2 };
    secondLate?.(
      new MessageEvent('message', {
        data: JSON.stringify(
          makeQuoteStatus('unavailable', {
            accountId: READONLY_IDS.accountB,
            symbol: 'MSFT',
            code: 'UNAUTHENTICATED',
            retryable: false,
          }),
        ),
      }),
    );
    expect(h.onUnauthorized).not.toHaveBeenCalled();
    h.store.reconcile();
    expect(h.store.getSnapshot()).toMatchObject({ epoch: 2, quote: null, observedAt: null });
    expect(h.maximumConcurrent()).toBe(1);
    h.state.session = null;
    h.store.reconcile();
    expect(h.store.getSnapshot()).toMatchObject({ epoch: null, quote: null, status: 'idle' });
    expect(h.sources.every((source) => source.closed)).toBe(true);
  });

  it('公共 schema 拒绝金融 number、时间不一致、跨符号、跨账户和业务流错误信封', () => {
    const h = harness();
    h.start();
    const valid = makeQuoteEvent();
    if (valid.kind !== 'quote') throw new Error('测试要求报价帧');
    h.latest().onmessage?.(new MessageEvent('message', { data: '{broken' }));
    h.latest().frame({ ...valid, value: { ...valid.value, quote: { ...valid.value.quote, bid: 312 } } });
    h.latest().frame({ ...valid, value: { ...valid.value, receivedAt: valid.value.receivedAt + 1 } });
    h.latest().frame({
      ...valid,
      value: { ...valid.value, quote: { ...valid.value.quote, symbol: 'MSFT' } },
    });
    h.latest().frame(makeQuoteEvent({ accountId: READONLY_IDS.accountB }));
    h.latest().frame(makeQuoteEvent({ symbol: 'MSFT' }));
    h.latest().frame({ error: { code: 'UNAUTHENTICATED', message: '业务流格式不适用' } });
    expect(h.store.getSnapshot().quote).toBeNull();
    expect(h.onUnauthorized).not.toHaveBeenCalled();
    h.latest().frame(valid);
    expect(h.store.getSnapshot().quote?.quote).toMatchObject({
      bid: '312.123456789012345678',
      askSize: null,
      timestampSource: 'LOCAL_RECEIPT',
    });
  });

  it('向后/重复推送及更旧 REST 不覆盖新报价，也不延长新鲜度', async () => {
    const h = harness();
    h.start();
    const receivedAt = Date.now();
    h.latest().frame(makeQuoteEvent({ receivedAt, eventTimestamp: 100, sourceTimestamp: 90 }));
    const accepted = h.store.getSnapshot();
    await vi.advanceTimersByTimeAsync(1_000);
    h.latest().frame(
      makeQuoteEvent({ receivedAt: receivedAt + 500, eventTimestamp: 99, sourceTimestamp: 91 }),
    );
    h.latest().frame(
      makeQuoteEvent({ receivedAt: receivedAt + 500, eventTimestamp: 101, sourceTimestamp: 89 }),
    );
    h.latest().frame(
      makeQuoteEvent({ receivedAt: receivedAt + 500, eventTimestamp: 100, sourceTimestamp: 90 }),
    );
    h.latest().frame(makeQuoteEvent({ receivedAt: receivedAt - 1, transport: 'REST' }));
    expect(h.store.getSnapshot()).toBe(accepted);
    await vi.advanceTimersByTimeAsync(MARKET_DISPLAY_REFERENCE_MS - 1_000);
    expect(h.store.getSnapshot().stale).toBe(true);
  });
});

describe('报价终止与有界恢复', () => {
  it('retryable 上游状态保持同一客户端源，不叠加官方重连和本地重连', async () => {
    const h = harness();
    h.start();
    for (const status of ['connecting', 'waiting', 'reconnecting', 'unavailable'] as const) {
      h.latest().frame(makeQuoteStatus(status, { code: 'MOCK_UPSTREAM_WAIT', retryable: true }));
    }
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.sources).toHaveLength(1);
    expect(h.latest().closed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('匹配的 retryable=false 终止并移除旧价；不自动恢复也不被 retry 复活', async () => {
    const h = harness();
    h.start();
    h.latest().frame(makeQuoteEvent());
    h.latest().frame(
      makeQuoteStatus('unavailable', {
        accountId: READONLY_IDS.accountB,
        code: 'ACCOUNT_CHANGED',
        retryable: false,
      }),
    );
    expect(h.latest().closed).toBe(false);
    h.latest().frame(makeQuoteStatus('unavailable', { code: 'ACCOUNT_CHANGED', retryable: false }));
    expect(h.store.getSnapshot()).toMatchObject({
      status: 'terminal',
      quote: null,
      stale: true,
      code: 'ACCOUNT_CHANGED',
    });
    expect(h.latest().closed).toBe(true);
    expect(h.latest().onmessage).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    h.store.retry();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.sources).toHaveLength(1);
    expect(h.onUnauthorized).not.toHaveBeenCalled();
  });

  it('仅公开匹配的终止 UNAUTHENTICATED 使当前 epoch 失效一次', () => {
    const h = harness();
    h.start();
    const late = h.latest().onmessage;
    const terminal = makeQuoteStatus('unavailable', { code: 'UNAUTHENTICATED', retryable: false });
    h.latest().frame(terminal);
    late?.(new MessageEvent('message', { data: JSON.stringify(terminal) }));
    h.store.retry();
    expect(h.onUnauthorized).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.sources).toHaveLength(1);
  });

  it('传输 error 先关闭原生重连，3/6/12 秒后最多三次自动建连，预算解除也不自行再试', async () => {
    const h = harness();
    h.start();
    for (const delay of [3_000, 6_000, 12_000]) {
      const source = h.latest();
      const lateError = source.onerror;
      source.error();
      expect(source.closed).toBe(true);
      expect(source.onerror).toBeNull();
      lateError?.(new Event('error'));
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(h.sources).toHaveLength(4);
    h.latest().error();
    expect(h.store.getSnapshot().status).toBe('degraded');
    expect(vi.getTimerCount()).toBe(0);
    expect(h.onUnauthorized).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sources).toHaveLength(4);
    h.store.retry();
    expect(h.sources).toHaveLength(5);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('证券/epoch/stop-start 不重置一分钟建连预算', () => {
    const h = harness();
    h.start();
    h.store.setSubscription({ ...SELECTION, symbol: 'MSFT' });
    h.state.session = { ...SESSION, epoch: 2 };
    h.store.reconcile();
    h.store.stop();
    h.store.setSubscription(SELECTION);
    h.store.start();
    expect(h.sources).toHaveLength(4);
    h.store.setSubscription({ ...SELECTION, symbol: 'NVDA' });
    expect(h.sources).toHaveLength(4);
    expect(h.store.getSnapshot()).toMatchObject({ status: 'degraded', quote: null });
    h.store.retry();
    expect(h.sources).toHaveLength(4);
  });

  it('断线旧价不再 live，stop 清全部计时器和原生监听器', async () => {
    const h = harness();
    h.start();
    h.latest().frame(makeQuoteEvent());
    const rest = { quotes: [makeMarketQuote()], streamRevisionAtStart: 0 };
    expect(selectMarketQuote(h.store.getSnapshot(), rest, SELECTION, 1)?.isLive).toBe(true);
    const late = h.latest().onmessage;
    h.latest().error();
    expect(selectMarketQuote(h.store.getSnapshot(), rest, SELECTION, 1)?.isLive).toBe(false);
    h.store.stop();
    late?.(new MessageEvent('message', { data: JSON.stringify(makeQuoteEvent()) }));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.store.getSnapshot()).toMatchObject({ status: 'idle', quote: null, subscription: null });
    expect(vi.getTimerCount()).toBe(0);
    expect(h.sources).toHaveLength(1);
  });

  it('原生构造失败也只有有限重试，不绕过连接预算', async () => {
    const factory = vi.fn<BusinessEventSourceFactory>(() => {
      throw new Error('Mock 构造失败');
    });
    const store = new MarketQuoteStore({
      url: '/api/v1/events',
      getSession: () => SESSION,
      onUnauthorized: vi.fn(),
      createEventSource: factory,
    });
    cleanups.push(() => store.stop());
    store.setSubscription(SELECTION);
    store.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(factory).toHaveBeenCalledTimes(4);
    expect(store.getSnapshot().status).toBe('degraded');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('REST 与流的显示顺序', () => {
  it('晚返回 REST 即使 receipt 更晚，也不能覆盖请求期间收到的新 WS；后续显式 REST 才可成为快照', () => {
    const h = harness();
    h.start();
    const revisionAtRequest = h.store.getSnapshot().quoteRevision;
    h.latest().frame(makeQuoteEvent());
    const quotes = [
      makeMarketQuote('AAPL', { timestamp: '2026-11-10T12:00:01.000Z', bid: '999', ask: '1000' }),
    ];
    const stream = h.store.getSnapshot();
    const late = selectMarketQuote(
      stream,
      { quotes, streamRevisionAtStart: revisionAtRequest },
      SELECTION,
      1,
    );
    expect(late?.quote.bid).toBe('312.123456789012345678');
    expect(late?.transport).toBe('WEBSOCKET');
    const explicit = selectMarketQuote(
      stream,
      { quotes, streamRevisionAtStart: stream.quoteRevision },
      SELECTION,
      1,
    );
    expect(explicit).toMatchObject({ quote: { bid: '999' }, transport: 'REST', isLive: false });
  });

  it('终止不能被旧 REST 复活；跨选择/epoch 和未知 REST 时间不能覆盖已有流', () => {
    const h = harness();
    h.start();
    h.latest().frame(makeQuoteEvent());
    const unknownTime = {
      quotes: [makeMarketQuote('AAPL', { timestamp: 'unknown source time' })],
      streamRevisionAtStart: h.store.getSnapshot().quoteRevision,
    };
    expect(selectMarketQuote(h.store.getSnapshot(), unknownTime, SELECTION, 1)?.transport).toBe('WEBSOCKET');
    expect(
      selectMarketQuote(h.store.getSnapshot(), undefined, { ...SELECTION, symbol: 'MSFT' }, 1),
    ).toBeNull();
    expect(selectMarketQuote(h.store.getSnapshot(), undefined, SELECTION, 2)).toBeNull();
    h.latest().frame(makeQuoteStatus('unavailable', { code: 'ACCOUNT_CHANGED', retryable: false }));
    expect(selectMarketQuote(h.store.getSnapshot(), unknownTime, SELECTION, 1)).toBeNull();
  });
});

it('消费者在报价或恢复通知中同步 stop 也不会遗留新建计时器', () => {
  const quoted = harness();
  quoted.start();
  quoted.store.subscribe(() => {
    if (quoted.store.getSnapshot().quote !== null) quoted.store.stop();
  });
  quoted.latest().frame(makeQuoteEvent());
  expect(quoted.store.getSnapshot()).toMatchObject({ status: 'idle', quote: null });
  expect(vi.getTimerCount()).toBe(0);

  const reconnecting = harness();
  reconnecting.start();
  reconnecting.store.subscribe(() => {
    if (reconnecting.store.getSnapshot().status === 'reconnecting') reconnecting.store.stop();
  });
  reconnecting.latest().error();
  expect(reconnecting.store.getSnapshot().status).toBe('idle');
  expect(vi.getTimerCount()).toBe(0);
});
