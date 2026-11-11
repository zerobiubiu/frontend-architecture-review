import { Text } from '@astryxdesign/core';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { useReadSearch } from '@/lib/read-only/search';
import { ORDER_COLUMNS, ORDER_INITIAL_COLUMNS } from './columns';
import { useOrdersList } from './queries';
import { orderSearchSchema } from './schemas';

const FILTER_FIELDS: readonly FilterField[] = [
  { name: 'accountId', label: '账户 ID', placeholder: 'UUID；留空为授权范围' },
  { name: 'ownerUserId', label: '所有者 ID', placeholder: '交易员仅本人；管理员可跨所有者' },
  { name: 'symbol', label: '证券代码（精确）', placeholder: '按原串匹配，不自动转大写' },
  { name: 'status', label: '订单状态（精确）', placeholder: '如 FILLED、UNKNOWN' },
  { name: 'search', label: '订单关键词', placeholder: '客户 ID、提交键、证券、原因' },
  { name: 'from', label: '创建时间起（UTC）', placeholder: '2026-11-01T00:00:00Z' },
  { name: 'to', label: '创建时间止（UTC）', placeholder: '2026-11-30T23:59:59Z' },
];

export function OrdersPage() {
  const state = useReadSearch(orderSearchSchema);
  const query = useOrdersList(state.search, state.error === null);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(ORDER_INITIAL_COLUMNS);
  const search = state.search;
  return (
    <ReadPage title="订单" description="本地订单记录与独立证据；不提交、不撤单、不主动核对。">
      <FilterBar
        fields={FILTER_FIELDS}
        values={{
          accountId: search.accountId ?? '',
          ownerUserId: search.ownerUserId ?? '',
          symbol: search.symbol ?? '',
          status: search.status ?? '',
          search: search.search ?? '',
          from: search.from ?? '',
          to: search.to ?? '',
        }}
        onApply={state.apply}
        onReset={state.reset}
        isPending={query.isFetching}
      />
      <Text as="p" size="sm" color="secondary">
        条件按 AND 生效；关键词仅搜客户订单 ID、提交幂等键、证券与原因，不搜索本地／官方订单
        ID。日期为含边界的 createdAt，不是成交时间。固定 createdAt DESC、id DESC，无自选排序。
      </Text>
      <QuerySurface query={query} disabledReason={state.error ?? undefined} label="订单查询结果">
        {(data) => (
          <>
            <Text as="p" size="sm" color="secondary">
              来源：{data.source}。FILLED 仅是订单状态，不表示现金结算、费用、库存或预留已闭环；存储均价 0
              不是市场报价。本金／名义额沿用返回的 quoteCurrency，缺失时币种未知。
            </Text>
            <DataTableShell
              data={data.items}
              columns={ORDER_COLUMNS}
              totalItems={data.total}
              page={data.page}
              pageSize={data.pageSize}
              onPageChange={state.setPage}
              onPageSizeChange={state.setPageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              getRowId={(row) => row.id}
              columnVisibility={visibility}
              onColumnVisibilityChange={setVisibility}
              emptyTitle="没有匹配当前筛选的本地订单"
              emptyDescription="只说明本次授权范围与筛选结果，不代表官方账户没有订单。"
            />
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
