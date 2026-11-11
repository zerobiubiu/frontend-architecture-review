import { Banner, Button, Text } from '@astryxdesign/core';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import { useReadSearch } from '@/lib/read-only/search';
import { LedgerEntryDetails } from './entry-details';
import { useLedger } from './queries';
import { type LedgerData, type LedgerEntry, type LedgerSearch, ledgerSearchSchema } from './schemas';

const LEDGER_FILTERS: readonly FilterField[] = [
  { name: 'accountId', label: '账户 UUID' },
  { name: 'ownerUserId', label: '所有者 UUID' },
  { name: 'symbol', label: '关联订单证券（原串精确匹配）' },
  { name: 'status', label: '流水类型（status 参数）', placeholder: '例如 ORDER_FEE' },
  { name: 'search', label: '类型／说明关键词' },
  { name: 'from', label: '创建时间起（UTC）', placeholder: '2026-11-01T00:00:00Z' },
  { name: 'to', label: '创建时间止（UTC）', placeholder: '2026-11-30T23:59:59Z' },
];

function LedgerResults({
  data,
  search,
  setPage,
  setPageSize,
}: {
  readonly data: LedgerData;
  readonly search: LedgerSearch;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (pageSize: number) => void;
}) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const columns = useMemo<ColumnDef<typeof tableFeatures, LedgerEntry>[]>(
    () => [
      {
        accessorKey: 'id',
        header: '流水 UUID',
        cell: ({ row }) => <span className="break-all">{row.original.id}</span>,
      },
      { accessorKey: 'type', header: '类型', cell: ({ row }) => <StatusValue value={row.original.type} /> },
      {
        accessorKey: 'amount',
        header: '服务端有符号金额',
        cell: ({ row }) => <DecimalValue value={row.original.amount} currency={row.original.currency} />,
      },
      { accessorKey: 'currency', header: '币种', cell: ({ row }) => row.original.currency ?? '未知' },
      {
        accessorKey: 'balanceAfter',
        header: '记录后余额（非官方）',
        cell: ({ row }) => (
          <DecimalValue value={row.original.balanceAfter} currency={row.original.currency} />
        ),
      },
      { accessorKey: 'description', header: '说明' },
      { accessorKey: 'exchangeAccountId', header: '账户 UUID' },
      {
        accessorKey: 'createdAt',
        header: '创建时间',
        cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
      },
      {
        id: 'detail',
        header: '已加载行',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            label="展开"
            aria-label={`查看流水 ${row.original.id}`}
            variant="secondary"
            size="sm"
            onClick={() => setSelectedId(row.original.id)}
          />
        ),
      },
    ],
    [],
  );
  const selected = data.items.find((entry) => entry.id === selectedId);
  return (
    <>
      <Text as="p" size="sm" color="secondary">
        来源：{data.source}。创建时间倒序、UUID 倒序；总数和当前页均由服务端返回，不计算跨币种合计或利润。
      </Text>
      <DataTableShell
        data={data.items}
        columns={columns}
        title="资金流水"
        totalItems={data.total}
        page={search.page}
        pageSize={search.pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        getRowId={(entry) => entry.id}
        emptyTitle="当前筛选没有返回流水"
        emptyDescription="空结果不代表已核实零余额或完整现金结算。"
      />
      {selected ? (
        <LedgerEntryDetails entry={selected} />
      ) : selectedId ? (
        <Text as="p" size="sm" color="secondary">
          所选流水未在当前页加载；这不证明记录不存在。请返回相应筛选和页码，不发起不存在的流水详情请求。
        </Text>
      ) : null}
    </>
  );
}

export function LedgerPage() {
  const state = useReadSearch(ledgerSearchSchema);
  const query = useLedger(state.search, state.error === null);
  const values = {
    accountId: state.search.accountId ?? '',
    ownerUserId: state.search.ownerUserId ?? '',
    symbol: state.search.symbol ?? '',
    status: state.search.status ?? '',
    search: state.search.search ?? '',
    from: state.search.from ?? '',
    to: state.search.to ?? '',
  };
  return (
    <ReadPage title="资金流水" description="本地占用、释放、成交名义流量和已确认费用；不是完整官方现金结算。">
      <Banner
        status="info"
        title="USD、USDC 与本地预留必须分开"
        description="RESERVATION／RELEASE 为本地占用及反向释放，买入预留为 USDC；TRADE_BUY／TRADE_SELL 为负／正 USD 名义流量，ORDER_FEE 为已确认的负 USD 费用增量。未知币种、未知 balanceAfter 均不补零。"
      />
      <FilterBar
        fields={LEDGER_FILTERS}
        values={values}
        onApply={state.apply}
        onReset={state.reset}
        isPending={query.isFetching}
      />
      <Text as="p" size="sm" color="secondary">
        类型使用 status 参数；日期筛选 createdAt（含边界）。证券经 orderId
        关联订单后精确匹配，无关联订单的流水不会因此变成证券总账。
      </Text>
      <QuerySurface query={query} disabledReason={state.error ?? undefined} label="资金流水查询结果">
        {(data) => (
          <LedgerResults
            data={data}
            search={state.search}
            setPage={state.setPage}
            setPageSize={state.setPageSize}
          />
        )}
      </QuerySurface>
    </ReadPage>
  );
}
