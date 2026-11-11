import { Banner, Button, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useQueryScope } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { FilterBar } from '@/components/read-only/filters';
import { DefinitionList } from '@/components/read-only/object-details';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { StatusValue, UtcValue } from '@/components/read-only/values';
import { isReadAccessError } from '@/lib/read-only/response';
import { useReadSearch } from '@/lib/read-only/search';
import { MARKET_DISPLAY_REFERENCE_MS } from '@/services/realtime/market-quotes';
import { canReadMarket, useMarketQuote } from './queries';
import { QuoteBook } from './quote-book';
import { selectMarketQuote } from './quote-selection';
import { marketSearchSchema } from './schemas';

const FIELDS = [
  { name: 'accountId', label: '账户 ID', placeholder: '必填，不使用后端隐含默认账户' },
  { name: 'symbol', label: '证券代码', placeholder: '输入官方代码，查询时规范化' },
];

export function MarketPage() {
  const state = useReadSearch(marketSearchSchema);
  const scope = useQueryScope();
  const { market } = useAppServices();
  const snapshot = useSyncExternalStore(market.subscribe, market.getSnapshot, market.getSnapshot);
  const query = useMarketQuote(state.search, state.error === null);
  const accountId = state.search.accountId;
  const symbol = state.search.symbol;
  const accessDenied = isReadAccessError(query.error);
  const enabled =
    state.error === null &&
    accountId !== undefined &&
    symbol !== undefined &&
    scope.user !== null &&
    canReadMarket(scope.user) &&
    !accessDenied;
  useLayoutEffect(() => {
    market.setSubscription(enabled && accountId && symbol ? { accountId, symbol } : null);
    return () => market.setSubscription(null);
  }, [market, enabled, accountId, symbol]);
  const scoped =
    enabled &&
    snapshot.epoch === scope.epoch &&
    snapshot.subscription?.accountId === accountId &&
    snapshot.subscription?.symbol === symbol;
  const displayed =
    enabled && accountId && symbol
      ? selectMarketQuote(snapshot, query.data, { accountId, symbol }, scope.epoch)
      : null;
  const disabledReason =
    state.error ??
    (!accountId || !symbol
      ? '选择账户并输入证券代码后点击查询。一个页面只订阅当前一个账户、一个证券。'
      : undefined);
  return (
    <ReadPage
      title="行情报价"
      description="本站后端授权的 Binance Stocks 买一 / 卖一报价；REST 初始读取与独立报价 SSE 分开表达。"
      toolbar={
        <Link to="/securities" className="text-sm underline underline-offset-4">
          查找官方证券代码
        </Link>
      }
    >
      <FilterBar
        fields={FIELDS}
        values={{ accountId: accountId ?? '', symbol: symbol ?? '' }}
        onApply={state.apply}
        onReset={state.reset}
        isPending={query.isFetching}
      />
      <Text as="p" size="sm" color="secondary">
        报价读取可能写入服务端审计。页面不连接官方 WebSocket、不持有交易所凭据，不提供下单、K
        线、深度历史或图表。UNKNOWN 交易状态不是正常交易确认。
      </Text>
      {enabled ? (
        <section aria-label="独立报价流状态" className="flex min-w-0 flex-col gap-3">
          <DefinitionList
            items={[
              {
                label: '客户端报价连接',
                value: <StatusValue value={scoped ? snapshot.status : 'connecting'} />,
              },
              {
                label: '后端上游状态（不是报价时间）',
                value: <StatusValue value={scoped ? snapshot.upstreamStatus : null} />,
              },
              {
                label: '订阅账户 / 证券',
                value: (
                  <span className="break-all">
                    {accountId} / {symbol}
                  </span>
                ),
              },
              {
                label: '公开状态代码',
                value: scoped && snapshot.code ? snapshot.code.slice(0, 160) : '未提供',
              },
            ]}
          />
          <Text as="p" size="sm" color="secondary">
            open 只表示 SSE 连接建立，live 状态本身也不刷新报价时间。客户端自收到有效流报价起{' '}
            {MARKET_DISPLAY_REFERENCE_MS / 1_000} 秒为展示参考阈值，不是后端交易 TTL
            或交易所时效承诺。断线保留值只作历史参考。
          </Text>
          {scoped && snapshot.error ? (
            <Banner
              status="warning"
              title={snapshot.status === 'terminal' ? '订阅已终止' : '报价连接不可用'}
              description={snapshot.error}
            />
          ) : null}
          {scoped && snapshot.retryAt !== null ? (
            <Text as="p" size="sm" color="secondary">
              下次重试 / 预算解除参考时间：
              <UtcValue value={new Date(snapshot.retryAt).toISOString()} />
            </Text>
          ) : null}
          {scoped && snapshot.status === 'degraded' ? (
            <Button label="重试报价连接" variant="secondary" onClick={() => market.retry()} />
          ) : null}
          {displayed === null ? (
            <Banner
              status="info"
              title="尚无可展示报价"
              description={
                scoped && snapshot.status === 'terminal'
                  ? '此订阅已被服务端终止，旧报价与缓存不会恢复为当前行情。'
                  : '等待有效 REST 或报价流数据；连接成功不能代替收到报价。'
              }
            />
          ) : null}
        </section>
      ) : null}
      {displayed ? <QuoteBook key={`${scope.epoch}:${accountId}:${symbol}`} value={displayed} /> : null}
      <QuerySurface query={query} disabledReason={disabledReason} label="独立 REST 报价读取">
        {(data) => (
          <DefinitionList
            items={[
              { label: '最后成功 REST 证券', value: data.quotes[0]?.symbol ?? '未提供' },
              { label: 'REST 来源', value: <StatusValue value={data.quotes[0]?.source} /> },
              {
                label: 'REST 后端接收时间（非交易所时间）',
                value: <UtcValue value={data.quotes[0]?.timestamp} />,
              },
              {
                label: 'REST 时间完整性',
                value: '未提供交易所行情事件 / 源时间；不会覆盖请求期间收到的更新 WS 推送',
              },
            ]}
          />
        )}
      </QuerySurface>
    </ReadPage>
  );
}
