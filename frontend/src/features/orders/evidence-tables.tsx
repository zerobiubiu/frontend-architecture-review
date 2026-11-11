import { Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { JsonDetails } from '@/components/read-only/object-details';
import { DecimalValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import type { LocalTradeView, OrderEventView } from './schemas';

type BusinessEventView = Pick<
  OrderEventView,
  'id' | 'ownerUserId' | 'type' | 'message' | 'details' | 'createdAt'
>;
const TRADE_COLUMNS: ColumnDef<typeof tableFeatures, LocalTradeView>[] = [
  { accessorKey: 'id', header: '本地成交 ID' },
  { accessorKey: 'exchangeTradeId', header: '官方成交 ID' },
  {
    accessorKey: 'orderId',
    header: '本地订单 ID',
    cell: ({ row }) => (
      <Link className="underline underline-offset-4" to="/orders/$id" params={{ id: row.original.orderId }}>
        {row.original.orderId}
      </Link>
    ),
  },
  { accessorKey: 'symbol', header: '证券' },
  { accessorKey: 'side', header: '方向' },
  {
    accessorKey: 'price',
    header: '成交价',
    cell: ({ row }) => <DecimalValue value={row.original.price} currency="USD" />,
  },
  {
    accessorKey: 'quantity',
    header: '成交股数',
    cell: ({ row }) => <DecimalValue value={row.original.quantity} />,
  },
  {
    accessorKey: 'fee',
    header: '逐笔费用',
    cell: ({ row }) => <DecimalValue value={row.original.fee} unavailableLabel="未知；未分摊订单累计费用" />,
  },
  {
    accessorKey: 'filledAt',
    header: '成交时间（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.filledAt} />,
  },
];
const EVENT_COLUMNS: ColumnDef<typeof tableFeatures, BusinessEventView>[] = [
  { accessorKey: 'type', header: '业务事件类型', enableHiding: false },
  { accessorKey: 'message', header: '事件说明' },
  {
    accessorKey: 'createdAt',
    header: '事件时间（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
  },
  { accessorKey: 'id', header: '事件 ID' },
  { accessorKey: 'ownerUserId', header: '所有者 ID' },
  {
    id: 'details',
    header: '公开附加字段',
    cell: ({ row }) => <JsonDetails value={row.original.details} title="查看事件附加字段" />,
  },
];

export function LocalTradesTable({ trades }: { readonly trades: LocalTradeView[] }) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  return (
    <section aria-labelledby="local-trades-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="local-trades-title" size="lg" weight="semibold">
        本地逐笔成交
      </Text>
      <Text as="p" size="sm" color="secondary">
        来自本次详情内嵌 trades，按 filledAt
        正序，无分页。不是全账户官方历史；逐笔费用未知时不从订单累计费用反推。
      </Text>
      <DataTableShell
        data={trades}
        columns={TRADE_COLUMNS}
        pagination={false}
        getRowId={(row) => row.id}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        emptyTitle="该详情未返回本地逐笔成交"
        emptyDescription="不据此认定官方没有成交。"
      />
    </section>
  );
}

export function BusinessEventsTable({ events }: { readonly events: BusinessEventView[] }) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({ ownerUserId: false });
  return (
    <section aria-labelledby="business-events-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="business-events-title" size="lg" weight="semibold">
        业务事件
      </Text>
      <Text as="p" size="sm" color="secondary">
        来自本次详情内嵌 events，按 createdAt 正序，无分页。事件不是操作回执，也不是业务通知 SSE 的补播历史。
      </Text>
      <DataTableShell
        data={events}
        columns={EVENT_COLUMNS}
        pagination={false}
        getRowId={(row) => row.id}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        emptyTitle="该详情未返回业务事件"
      />
    </section>
  );
}
