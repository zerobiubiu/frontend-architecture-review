import { Banner, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { DefinitionList } from '@/components/read-only/object-details';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { UtcValue } from '@/components/read-only/values';
import { useReadSearch } from '@/lib/read-only/search';
import { useOfficialTrades } from './queries';
import { tradeSearchSchema } from './schemas';
import { TradeTable } from './trade-table';

const FIELDS: readonly FilterField[] = [
  { name: 'accountId', label: '官方历史账户 UUID' },
  { name: 'symbol', label: '官方历史证券代码', placeholder: '留空不限证券；按公开规则 trim / 大写' },
  { name: 'from', label: '成交历史筛选起点 UTC', placeholder: '2026-11-01T00:00:00Z' },
  { name: 'to', label: '成交历史筛选终点 UTC', placeholder: '2026-11-11T23:59:59Z' },
];

export function TradesPage() {
  const state = useReadSearch(tradeSearchSchema);
  const { search, error } = state;
  const query = useOfficialTrades(search, error === null);
  const incomplete = !search.accountId || !search.from || !search.to;
  return (
    <ReadPage
      title="官方成交历史"
      description="按账户读取官方历史的一页。不是本地全局成交列表，不导入或同步成交。"
    >
      <FilterBar
        fields={FIELDS}
        values={{
          accountId: search.accountId ?? '',
          symbol: search.symbol ?? '',
          from: search.from ?? '',
          to: search.to ?? '',
        }}
        onApply={state.apply}
        onReset={state.reset}
      />
      {error ? <Banner status="error" title="筛选地址无效" description={error} /> : null}
      <Text as="p" size="sm" color="secondary">
        账户与显式 UTC
        起止筛选必须填写后才读取；筛选保存在地址中，翻页不会重新计算“当前时间”。不自动采用漂移的七天默认窗口，也不额外限制为七天。
        时间筛选不是响应时间、接收时间或数据完整性截止证明。
        <Link to="/accounts" className="underline underline-offset-4">
          查看账户
        </Link>
      </Text>
      <DefinitionList
        items={[
          { label: '已应用账户 UUID', value: search.accountId ?? '未选择' },
          {
            label: '官方历史来源',
            value: '/accounts/:id/exchange/trades · 官方一页（响应没有 source 字段）',
          },
          { label: '已应用筛选起点 UTC（请求参数 from）', value: <UtcValue value={search.from} /> },
          { label: '已应用筛选终点 UTC（请求参数 to）', value: <UtcValue value={search.to} /> },
        ]}
      />
      <QuerySurface
        query={query}
        disabledReason={
          error ??
          (incomplete ? '请选择账户并填写固定的 UTC 起止筛选时间；不会发送缺省时间窗口的历史请求' : undefined)
        }
        label="官方成交历史查询"
      >
        {(data) => (
          <>
            <Text as="p" size="sm" color="secondary">
              按官方返回顺序展示。总数来自服务端官方
              total，不以当前页条数推断完整历史；没有本地所有者、任务或方向筛选接口。
              外部账户成交没有保证送达的业务通知，页面不是实时成交回报。
            </Text>
            <TradeTable
              key={search.accountId}
              data={data}
              accountId={search.accountId ?? ''}
              onPageChange={state.setPage}
              onPageSizeChange={state.setPageSize}
            />
          </>
        )}
      </QuerySurface>
      <section aria-labelledby="local-trades-gap-title" className="flex min-w-0 flex-col gap-2">
        <Text as="h2" id="local-trades-gap-title" size="lg" weight="semibold">
          本地成交的读取边界
        </Text>
        <Text as="p" size="sm" color="secondary">
          本地成交仅嵌在已授权的订单或任务详情中，不是全量成交历史；当前没有全局本地成交 GET 或独立成交详情
          GET。 不把当前页订单的成交拼成完整历史，也不将官方订单 ID 当成本地 UUID。
        </Text>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link to="/orders" className="underline underline-offset-4">
            从本地订单查看成交
          </Link>
          <Link to="/tasks" className="underline underline-offset-4">
            从本地任务查看成交
          </Link>
        </div>
      </section>
      <Banner
        status="info"
        title="费用与金额口径"
        description="金额、价格与股数保留服务端十进制字符串；未知名义金额不补零，逐笔 fee 固定为 null，不分摊订单累计费。USD 价格/名义金额不等于 USDC 钱包结算或完整盈亏。只读官方历史可能写审计，不调用 POST 同步或导入。"
      />
    </ReadPage>
  );
}
