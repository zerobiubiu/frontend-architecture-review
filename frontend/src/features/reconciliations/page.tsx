import { Banner, Button, Text } from '@astryxdesign/core';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import { useReadSearch } from '@/lib/read-only/search';
import { useReconciliations } from './queries';
import { ReconciliationRecordDetails, reconciliationMeaning } from './record-details';
import { type ReconciliationRecord, reconciliationSearchSchema } from './schemas';

const RECONCILIATION_FILTERS: readonly FilterField[] = [
  { name: 'accountId', label: '账户 UUID' },
  { name: 'ownerUserId', label: '所有者 UUID' },
  {
    name: 'status',
    label: '核对状态',
    options: [
      { value: 'PARTIAL', label: 'PARTIAL · 部分证据' },
      { value: 'UNAVAILABLE', label: 'UNAVAILABLE · 不可用' },
      { value: 'DIFFERENCE', label: 'DIFFERENCE · 存在差异' },
    ],
  },
  { name: 'from', label: '记录创建时间起（UTC）' },
  { name: 'to', label: '记录创建时间止（UTC）' },
];

function ReconciliationResults({ data }: { readonly data: ReconciliationRecord[] }) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const columns = useMemo<ColumnDef<typeof tableFeatures, ReconciliationRecord>[]>(
    () => [
      { accessorKey: 'id', header: '记录 UUID' },
      { accessorKey: 'exchangeAccountId', header: '账户 UUID' },
      {
        accessorKey: 'status',
        header: '服务端状态',
        cell: ({ row }) => <StatusValue value={row.original.status} />,
      },
      {
        id: 'completeness',
        header: '结论范围',
        cell: ({ row }) => reconciliationMeaning(row.original.status),
      },
      { id: 'source', header: '来源', cell: ({ row }) => row.original.details.source ?? '未知' },
      {
        id: 'assets',
        header: 'Funding 证据',
        cell: ({ row }) =>
          row.original.details.assetsAvailable === true
            ? '本记录可用'
            : row.original.details.assetsAvailable === false
              ? '不可用'
              : '未知',
      },
      {
        accessorKey: 'createdAt',
        header: '记录创建时间',
        cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
      },
      {
        id: 'detail',
        header: '已加载行',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            label="展开"
            aria-label={`查看核对记录 ${row.original.id}`}
            variant="secondary"
            size="sm"
            onClick={() => setSelectedId(row.original.id)}
          />
        ),
      },
    ],
    [],
  );
  const selected = data.find((record) => record.id === selectedId);
  return (
    <>
      <DataTableShell
        data={data}
        columns={columns}
        pagination={false}
        title="核对记录"
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        getRowId={(record) => record.id}
        emptyTitle="本次没有返回核对记录"
        emptyDescription="没有记录不表示账户已核对、余额为零或全量一致。"
      />
      {selected ? (
        <ReconciliationRecordDetails record={selected} />
      ) : selectedId ? (
        <Text as="p" size="sm" color="secondary">
          所选记录未在当前返回数组中，未取得其详情；不推断不存在。
        </Text>
      ) : null}
    </>
  );
}

export function ReconciliationsPage() {
  const state = useReadSearch(reconciliationSearchSchema);
  const query = useReconciliations(state.search, state.error === null);
  return (
    <ReadPage title="账户核对记录" description="读取已保存的部分核对证据，不发起主动核对或恢复。">
      <Banner
        status="warning"
        title="PARTIAL、UNAVAILABLE、DIFFERENCE 均不是全量一致"
        description="这是记录数组，创建时间倒序，没有服务端分页。证券和关键词不会过滤此接口；只提供实际生效的所有者、账户、状态与创建时间筛选。"
      />
      <FilterBar
        fields={RECONCILIATION_FILTERS}
        values={{
          accountId: state.search.accountId ?? '',
          ownerUserId: state.search.ownerUserId ?? '',
          status: state.search.status ?? '',
          from: state.search.from ?? '',
          to: state.search.to ?? '',
        }}
        onApply={state.apply}
        onReset={state.reset}
        isPending={query.isFetching}
      />
      <Text as="p" size="sm" color="secondary">
        记录创建时间不是原核对历史窗口；当前记录不保存 historyTo，也没有
        updatedAt。账户变化通知仅提示重读，不保证核对记录完整推送。
      </Text>
      <QuerySurface query={query} disabledReason={state.error ?? undefined} label="核对记录查询结果">
        {(data) => <ReconciliationResults data={data} />}
      </QuerySurface>
    </ReadPage>
  );
}
