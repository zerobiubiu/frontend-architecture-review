import { Button, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { DefinitionList, JsonDetails } from '@/components/read-only/object-details';
import { QuerySurface } from '@/components/read-only/query-surface';
import { StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import { useReadSearch } from '@/lib/read-only/search';
import { useBusinessEvents } from './queries';
import {
  type BusinessEvent,
  type BusinessEventsData,
  type BusinessEventsSearch,
  businessEventsSearchSchema,
} from './schemas';

const EVENT_FILTERS: readonly FilterField[] = [
  { name: 'accountId', label: '事件账户 UUID' },
  { name: 'ownerUserId', label: '事件所有者 UUID' },
  { name: 'symbol', label: '事件证券（原串精确匹配）' },
  { name: 'status', label: '事件类型（status 参数）' },
  { name: 'search', label: '事件消息／类型关键词' },
  { name: 'from', label: '事件创建时间起（UTC）' },
  { name: 'to', label: '事件创建时间止（UTC）' },
];

function EventTarget({ event }: { readonly event: BusinessEvent }) {
  const id = event.resourceId;
  if (id && event.resourceType === 'ORDER')
    return (
      <Link to="/orders/$id" params={{ id }}>
        {id}
      </Link>
    );
  if (id && event.resourceType === 'TASK')
    return (
      <Link to="/tasks/$id" params={{ id }}>
        {id}
      </Link>
    );
  return <span>{id ?? '无关联对象（SYSTEM）'}</span>;
}

function EventResults({
  data,
  search,
  setPage,
  setPageSize,
}: {
  readonly data: BusinessEventsData;
  readonly search: BusinessEventsSearch;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (pageSize: number) => void;
}) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const columns = useMemo<ColumnDef<typeof tableFeatures, BusinessEvent>[]>(
    () => [
      { accessorKey: 'resourceType', header: '来源对象' },
      { accessorKey: 'id', header: '事件 ID' },
      {
        accessorKey: 'type',
        header: '事件类型',
        cell: ({ row }) => <StatusValue value={row.original.type} />,
      },
      { accessorKey: 'message', header: '业务消息' },
      {
        accessorKey: 'resourceId',
        header: '关联对象',
        cell: ({ row }) => <EventTarget event={row.original} />,
      },
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
            label="展开事件"
            aria-label={`查看业务事件 ${row.original.resourceType} ${row.original.id}`}
            variant="secondary"
            size="sm"
            onClick={() => setSelectedKey(`${row.original.resourceType}:${row.original.id}`)}
          />
        ),
      },
    ],
    [],
  );
  const selected = data.items.find((event) => `${event.resourceType}:${event.id}` === selectedKey);
  return (
    <>
      <DataTableShell
        data={data.items}
        columns={columns}
        title="业务事件（/logs）"
        totalItems={data.total}
        page={search.page}
        pageSize={search.pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        getRowId={(event) => `${event.resourceType}:${event.id}`}
        emptyTitle="本页没有返回业务事件"
        emptyDescription="不是运行日志、操作完整历史或某次原意图的终态证据。"
      />
      {selected ? (
        <section aria-label="已加载业务事件详情" className="flex min-w-0 flex-col gap-3">
          <Text as="h3" size="base" weight="semibold">
            已加载业务事件详情
          </Text>
          <DefinitionList
            items={[
              { label: '事件 ID', value: selected.id },
              { label: '来源对象', value: selected.resourceType },
              { label: '所有者 UUID', value: selected.ownerUserId ?? '全局事件，无所有者' },
              { label: '关联对象', value: <EventTarget event={selected} /> },
              { label: '事件类型', value: selected.type },
              { label: '消息', value: selected.message },
              { label: '创建时间', value: <UtcValue value={selected.createdAt} /> },
              {
                label: '公开原因／代码',
                value: selected.details.reason ?? selected.details.code ?? '未提供',
              },
            ]}
          />
          <JsonDetails value={selected.details} title="经过字段白名单的公开事件附加信息" />
        </section>
      ) : null}
    </>
  );
}

export function BusinessEventsSection() {
  const state = useReadSearch(businessEventsSearchSchema);
  const query = useBusinessEvents(state.search, state.error === null);
  return (
    <section aria-label="业务事件分页查询" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" size="lg" weight="semibold">
        业务事件
      </Text>
      <Text as="p" size="sm" color="secondary">
        独立读取 /logs：TASK／ORDER／SYSTEM 三源合并后真实分页，创建时间倒序、ID
        倒序。以下筛选及页码只作用于业务事件，不作用于上方操作回执；status 筛选事件 type，不是日志级别。
      </Text>
      <FilterBar
        fields={EVENT_FILTERS}
        values={{
          accountId: state.search.accountId ?? '',
          ownerUserId: state.search.ownerUserId ?? '',
          symbol: state.search.symbol ?? '',
          status: state.search.status ?? '',
          search: state.search.search ?? '',
          from: state.search.from ?? '',
          to: state.search.to ?? '',
        }}
        onApply={state.apply}
        onReset={state.reset}
        isPending={query.isFetching}
      />
      <QuerySurface query={query} disabledReason={state.error ?? undefined} label="业务事件查询结果">
        {(data) => (
          <EventResults
            data={data}
            search={state.search}
            setPage={state.setPage}
            setPageSize={state.setPageSize}
          />
        )}
      </QuerySurface>
    </section>
  );
}
