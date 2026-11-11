import type { MarketQuoteSnapshot, MarketSubscription } from '@/services/realtime/market-quotes';
import type { QuoteDto } from './api';
import type { RestQuoteRead } from './queries';

export interface DisplayedMarketQuote {
  readonly quote: QuoteDto;
  readonly transport: 'REST' | 'WEBSOCKET';
  readonly eventTimestamp: number | null;
  readonly sourceTimestamp: number | null;
  readonly isLive: boolean;
  readonly stale: boolean;
}

/** 只选择查询/流已有数据，不将 REST 复制进 store；跨选择、终止与晚到 REST 均不能复活旧行情。 */
export function selectMarketQuote(
  stream: MarketQuoteSnapshot,
  rest: RestQuoteRead | undefined,
  expected: MarketSubscription,
  epoch: number,
): DisplayedMarketQuote | null {
  const scoped =
    stream.epoch === epoch &&
    stream.subscription?.accountId === expected.accountId &&
    stream.subscription.symbol === expected.symbol;
  if (scoped && stream.status === 'terminal') return null;
  const snapshot = scoped ? stream.quote : null;
  const restQuote = rest?.quotes[0];
  const restMatches = restQuote?.symbol === expected.symbol;
  const restTime = restQuote ? Date.parse(restQuote.timestamp) : Number.NaN;
  // REST 在该 WS tick 前已经开始：即便网络更晚返回，也不覆盖请求期间收到的新推送。
  const newerWs =
    snapshot?.transport === 'WEBSOCKET' && stream.quoteRevision > (rest?.streamRevisionAtStart ?? -1);
  if (
    restMatches &&
    restQuote &&
    (!snapshot || (!newerWs && Number.isFinite(restTime) && restTime > snapshot.receivedAt))
  ) {
    return {
      quote: restQuote,
      transport: 'REST',
      eventTimestamp: null,
      sourceTimestamp: null,
      isLive: false,
      stale: true,
    };
  }
  if (!snapshot) return null;
  return {
    quote: snapshot.quote,
    transport: snapshot.transport,
    eventTimestamp: snapshot.eventTimestamp,
    sourceTimestamp: snapshot.sourceTimestamp,
    isLive:
      stream.status === 'open' &&
      stream.upstreamStatus === 'live' &&
      snapshot.transport === 'WEBSOCKET' &&
      !stream.stale,
    stale: stream.stale || stream.status !== 'open',
  };
}
