import { Button, Text } from '@astryxdesign/core';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import type { PositionRow, PositionsResponse } from './types';

function PositionDetails({ row }: { readonly row: PositionRow }) {
  return (
    <section
      id="nominal-position-details"
      aria-label="已加载名义持仓详情"
      className="flex min-w-0 flex-col gap-3"
    >
      <Text as="h3" size="base" weight="semibold">
        {row.symbol} · 名义记录详情
      </Text>
      <DefinitionList
        items={[
          { label: '本地持仓 UUID', value: row.id },
          { label: '账户 UUID', value: row.exchangeAccountId },
          { label: '所有者 UUID', value: row.ownerUserId },
          { label: '来源', value: <StatusValue value={row.source} /> },
          { label: '名义总股数 quantity', value: <DecimalValue value={row.quantity} /> },
          { label: '本地预留股数 reservedQuantity', value: <DecimalValue value={row.reservedQuantity} /> },
          {
            label: '本地未预留股数 localAvailableQuantity',
            value: <DecimalValue value={row.localAvailableQuantity} />,
          },
          {
            label: '名义均价 averageCost',
            value: <DecimalValue value={row.averageCost} currency={row.quoteCurrency} />,
          },
          {
            label: '名义成本 notionalCost',
            value: <DecimalValue value={row.notionalCost} currency={row.quoteCurrency} />,
          },
          {
            label: '存储 realizedPnl（非官方盈亏）',
            value: <DecimalValue value={row.realizedPnl} currency={row.quoteCurrency} />,
          },
          {
            label: '官方可用股数 availableQuantity',
            value: <DecimalValue value={row.availableQuantity} unavailableLabel="不可用，非本地未预留股数" />,
          },
          {
            label: '官方总股数 exchangeQuantity',
            value: <DecimalValue value={row.exchangeQuantity} unavailableLabel="不可用" />,
          },
          {
            label: '官方预留股数 exchangeReservedQuantity',
            value: <DecimalValue value={row.exchangeReservedQuantity} unavailableLabel="不可用" />,
          },
          {
            label: '标记价格 markPrice',
            value: <DecimalValue value={row.markPrice} unavailableLabel="不可用，不用行情补造" />,
          },
          {
            label: '未实现盈亏 unrealizedPnl',
            value: <DecimalValue value={row.unrealizedPnl} unavailableLabel="不可用" />,
          },
          { label: '报价来源时间 quoteTimestamp', value: <UtcValue value={row.quoteTimestamp} /> },
          { label: '官方资产可用性 assetsAvailable', value: row.assetsAvailable ? '可用' : '未提供' },
          {
            label: '估值估算 valuationEstimated',
            value: row.valuationEstimated ? '是' : '否；此记录不提供估值',
          },
          {
            label: '报价币种 / 结算币种',
            value: `${row.quoteCurrency} / ${row.settlementCurrency}（不同口径，不换算）`,
          },
          { label: '记录创建时间 UTC', value: <UtcValue value={row.createdAt} /> },
          { label: '记录更新时间 UTC', value: <UtcValue value={row.updatedAt} /> },
        ]}
      />
      <Text as="p" size="sm" color="secondary">
        本地未预留股数是服务端的名义余量，不是官方可卖库存。realizedPnl
        是存储字段，当前名义重放不计算全账户实现盈亏。
      </Text>
    </section>
  );
}

export function LocalPositions({
  data,
  onPageChange,
  onPageSizeChange,
}: {
  readonly data: PositionsResponse;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (size: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const columns = useMemo<ColumnDef<typeof tableFeatures, PositionRow>[]>(
    () => [
      { accessorKey: 'symbol', header: '证券', enableHiding: false },
      { accessorKey: 'exchangeAccountId', header: '账户 UUID' },
      {
        accessorKey: 'quantity',
        header: '名义总股数',
        cell: ({ row }) => <DecimalValue value={row.original.quantity} />,
      },
      {
        accessorKey: 'reservedQuantity',
        header: '本地预留股数',
        cell: ({ row }) => <DecimalValue value={row.original.reservedQuantity} />,
      },
      {
        accessorKey: 'localAvailableQuantity',
        header: '本地未预留股数',
        cell: ({ row }) => <DecimalValue value={row.original.localAvailableQuantity} />,
      },
      {
        accessorKey: 'averageCost',
        header: '名义均价 USD',
        cell: ({ row }) => (
          <DecimalValue value={row.original.averageCost} currency={row.original.quoteCurrency} />
        ),
      },
      {
        accessorKey: 'notionalCost',
        header: '名义成本 USD',
        cell: ({ row }) => (
          <DecimalValue value={row.original.notionalCost} currency={row.original.quoteCurrency} />
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: '记录更新 UTC',
        cell: ({ row }) => <UtcValue value={row.original.updatedAt} />,
      },
      {
        id: 'detail',
        header: '已加载记录',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            label={`查看 ${row.original.symbol} 名义记录`}
            variant="ghost"
            size="sm"
            aria-expanded={selectedId === row.original.id}
            aria-controls={selectedId === row.original.id ? 'nominal-position-details' : undefined}
            onClick={() => setSelectedId((current) => (current === row.original.id ? null : row.original.id))}
          />
        ),
      },
    ],
    [selectedId],
  );
  const selected = data.items.find((row) => row.id === selectedId);
  return (
    <>
      <Text as="p" size="sm" color="secondary">
        {data.source} · {data.unavailableReason}
      </Text>
      <DataTableShell
        data={data.items}
        columns={columns}
        totalItems={data.total}
        page={data.page}
        pageSize={data.pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        getRowId={(row) => row.id}
        emptyTitle="当前筛选没有名义持仓记录"
        emptyDescription="这是本系统记录，不表示所选账户的官方股票库存为零。"
      />
      {selected ? (
        <PositionDetails row={selected} />
      ) : selectedId ? (
        <Text as="p" role="status">
          所选名义记录不在当前返回页；未加载不代表记录不存在。
        </Text>
      ) : null}
    </>
  );
}
