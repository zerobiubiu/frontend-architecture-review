import { Banner, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { useSession } from '@/app/runtime-context';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { useReadSearch } from '@/lib/read-only/search';
import { LocalPositions } from './local-positions';
import { OfficialHoldings } from './official-holdings';
import { useOfficialHoldings, usePositions } from './queries';
import { positionSearchSchema } from './schemas';

const FIELDS: readonly FilterField[] = [
  { name: 'accountId', label: '账户 UUID（两种来源共用）', placeholder: '留空仅查询授权范围内的本地记录' },
  { name: 'symbol', label: '本地证券代码（原样匹配）' },
  { name: 'from', label: '本地记录创建起点 UTC', placeholder: '2026-11-01T00:00:00Z' },
  { name: 'to', label: '本地记录创建终点 UTC', placeholder: '2026-11-11T23:59:59Z' },
];
const ADMIN_FIELDS: readonly FilterField[] = [...FIELDS, { name: 'ownerUserId', label: '本地所有者 UUID' }];

export function PositionsPage() {
  const state = useReadSearch(positionSearchSchema);
  const session = useSession();
  const { search, error } = state;
  const local = usePositions(search, error === null);
  const official = useOfficialHoldings(search.accountId, error === null);
  return (
    <ReadPage
      title="持仓与官方候选"
      description="本地名义记录与本次官方 Funding 股票候选分开展示，不拼接、不计算估值或盈亏。"
    >
      <FilterBar
        fields={session.user?.role === 'ADMIN' ? ADMIN_FIELDS : FIELDS}
        values={{
          accountId: search.accountId ?? '',
          ownerUserId: search.ownerUserId ?? '',
          symbol: search.symbol ?? '',
          from: search.from ?? '',
          to: search.to ?? '',
        }}
        onApply={state.apply}
        onReset={state.reset}
      />
      {error ? <Banner status="error" title="筛选地址无效" description={error} /> : null}
      <Text as="p" size="sm" color="secondary">
        账户选择保存在地址中并同时作用于两种来源。证券、所有者、创建时间和页码只筛选本地记录；官方候选只接受账户。
        未选账户时本地为授权范围，官方不发请求。
        <Link to="/accounts" className="underline underline-offset-4">
          查看账户
        </Link>
      </Text>
      <section aria-labelledby="nominal-positions-title" className="flex min-w-0 flex-col gap-3">
        <Text as="h2" id="nominal-positions-title" size="lg" weight="semibold">
          本地名义持仓 · LOCAL_LEDGER
        </Text>
        <Text as="p" size="sm" color="secondary">
          仅依据本系统已确认成交形成的数量、成本与预留。名义总股数、本地未预留量、官方 free
          不是同一个字段；不合并为“可用持仓”。 服务器按证券代码、记录 UUID 升序分页，保留真实零股数行。
        </Text>
        <QuerySurface query={local} disabledReason={error ?? undefined} label="本地名义持仓查询">
          {(data) => (
            <LocalPositions
              key={search.accountId ?? 'authorized-scope'}
              data={data}
              onPageChange={state.setPage}
              onPageSizeChange={state.setPageSize}
            />
          )}
        </QuerySurface>
      </section>
      <section aria-labelledby="official-holdings-title" className="flex min-w-0 flex-col gap-3">
        <Text as="h2" id="official-holdings-title" size="lg" weight="semibold">
          本次官方 Funding 股票候选
        </Text>
        <Text as="p" size="sm" color="secondary">
          /market/holdings
          是当次官方读取，不是本地快照或全账户完整资产估值。候选身份严格核验，缺行不补零，未知不补零；候选本身不代表交易许可。
        </Text>
        <QuerySurface
          query={official}
          disabledReason={error ?? (search.accountId ? undefined : '请填写账户 UUID 后查询本次官方候选')}
          label="官方 Funding 候选查询"
        >
          {(data) => <OfficialHoldings key={data.accountId} data={data} />}
        </QuerySurface>
      </section>
      <Banner
        status="info"
        title="不可提供的资产口径"
        description="当前接口不提供完整官方总持仓、标记价格、估值或全账户实现/未实现盈亏。不会用名义成本、行情、独立钱包余额拼造这些结果。只调用 GET，不触发资产同步、导入或卖出预检；读取仍可能产生服务端审计等副作用。"
      />
    </ReadPage>
  );
}
