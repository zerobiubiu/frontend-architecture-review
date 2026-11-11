import { Button, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { FilterBar } from '@/components/read-only/filters';
import { DefinitionList } from '@/components/read-only/object-details';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import { useReadSearch } from '@/lib/read-only/search';
import { useSecuritiesCatalog } from './queries';
import { RuleFlag, SecurityRuleDetails } from './rule-details';
import { type CatalogPage, type EquityRule, securitiesSearchSchema } from './schemas';

const FIELDS = [
  { name: 'accountId', label: '账户 ID', placeholder: '必填，所属账户的 UUID' },
  { name: 'search', label: '证券代码包含', placeholder: '官方代码子串，非精确查询' },
];

function CatalogResults({
  data,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  readonly data: CatalogPage;
  readonly page: number;
  readonly pageSize: number;
  readonly onPage: (page: number) => void;
  readonly onPageSize: (pageSize: number) => void;
}) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const columns = useMemo<ColumnDef<typeof tableFeatures, EquityRule>[]>(
    () => [
      {
        id: 'symbol',
        accessorKey: 'symbol',
        header: '证券代码',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            label={row.original.symbol}
            variant="ghost"
            size="sm"
            onClick={() => setSelectedSymbol(row.original.symbol)}
          />
        ),
      },
      {
        accessorKey: 'tradability',
        header: '可交易方向',
        cell: ({ row }) => <StatusValue value={row.original.tradability} />,
      },
      {
        accessorKey: 'minQuantity',
        header: '最小股数',
        cell: ({ row }) => <DecimalValue value={row.original.minQuantity} />,
      },
      {
        accessorKey: 'stepSize',
        header: '股数步长',
        cell: ({ row }) => <DecimalValue value={row.original.stepSize} />,
      },
      {
        accessorKey: 'minNotional',
        header: '最小名义金额',
        cell: ({ row }) => <DecimalValue value={row.original.minNotional} />,
      },
      {
        accessorKey: 'fractionable',
        header: '碎股',
        cell: ({ row }) => <RuleFlag value={row.original.fractionable} />,
      },
      {
        accessorKey: 'extendedSession',
        header: '延长时段',
        cell: ({ row }) => <RuleFlag value={row.original.extendedSession} />,
      },
      {
        accessorKey: 'overnightSupported',
        header: '隔夜',
        cell: ({ row }) => <RuleFlag value={row.original.overnightSupported} />,
      },
    ],
    [],
  );
  const selected = data.items.find((item) => item.symbol === selectedSymbol);
  return (
    <>
      <DefinitionList
        items={[
          { label: '目录来源', value: <StatusValue value={data.source} /> },
          { label: '排序与范围', value: '代码升序；总数为当前子串筛选后的服务端总数' },
          { label: '官方目录获取时间 · fetchedAt', value: <UtcValue value={data.fetchedAt} /> },
          { label: '服务端目录到期时间 · expiresAt', value: <UtcValue value={data.expiresAt} /> },
        ]}
      />
      <DataTableShell
        data={data.items}
        columns={columns}
        totalItems={data.total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPage}
        onPageSizeChange={onPageSize}
        pageSizeOptions={[25, 50, 100]}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        getRowId={(row) => row.symbol}
        title="官方支持证券"
        emptyTitle="这一页没有匹配证券"
        emptyDescription="子串搜索只覆盖当前服务端分页；越界页为空不等于证券不存在。"
      />
      {selected ? <SecurityRuleDetails rule={selected} /> : null}
    </>
  );
}

export function SecuritiesPage() {
  const state = useReadSearch(securitiesSearchSchema);
  const query = useSecuritiesCatalog(state.search, state.error === null);
  const disabledReason =
    state.error ??
    (!state.search.accountId
      ? '请选择所属账户后读取官方证券目录。账户须 ACTIVE 且已保存读取凭据；无需打开交易执行开关。'
      : undefined);
  return (
    <ReadPage
      title="证券目录"
      description="按所选账户读取 Binance Stocks 官方支持证券及交易规则。只提供代码子串筛选，不加入分类、公司名或人工白名单。"
      toolbar={
        <Link to="/accounts" className="text-sm underline underline-offset-4">
          查看账户 ID
        </Link>
      }
    >
      <FilterBar
        fields={FIELDS}
        values={{ accountId: state.search.accountId ?? '', search: state.search.search ?? '' }}
        onApply={state.apply}
        onReset={state.reset}
        isPending={query.isFetching}
      />
      <Text as="p" size="sm" color="secondary">
        查询可能读取官方接口并更新后端目录缓存或审计；不是交易操作。目录按账户与凭据隔离，有效窗口以返回时间为准。未返回规则保持未知。
      </Text>
      <QuerySurface query={query} disabledReason={disabledReason} label="证券目录查询结果">
        {(data) => (
          <CatalogResults
            key={`${state.search.accountId}:${state.search.search ?? ''}:${state.search.page}:${state.search.pageSize}`}
            data={data}
            page={state.search.page}
            pageSize={state.search.pageSize}
            onPage={state.setPage}
            onPageSize={state.setPageSize}
          />
        )}
      </QuerySurface>
    </ReadPage>
  );
}
