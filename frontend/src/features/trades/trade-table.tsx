import { Button, Text } from '@astryxdesign/core';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import type { OfficialTradeRow, OfficialTradesResponse } from './types';

function TradeDetails({ row, accountId }: { readonly row: OfficialTradeRow; readonly accountId: string }) {
  return (
    <section
      id="official-trade-details"
      aria-label="已加载官方成交详情"
      className="flex min-w-0 flex-col gap-3"
    >
      <Text as="h2" size="lg" weight="semibold">
        官方成交详情 · {row.exchangeTradeId}
      </Text>
      <DefinitionList
        items={[
          { label: '查询账户 UUID（请求范围）', value: accountId },
          { label: '官方成交 ID exchangeTradeId', value: row.exchangeTradeId },
          { label: '关联官方订单 ID exchangeOrderId', value: row.exchangeOrderId },
          { label: '证券 symbol', value: row.symbol },
          { label: '方向 side', value: <StatusValue value={row.side} /> },
          { label: '成交价格 price', value: <DecimalValue value={row.price} currency={row.priceCurrency} /> },
          { label: '成交股数 quantity', value: <DecimalValue value={row.quantity} /> },
          {
            label: '官方名义金额 notional',
            value: <DecimalValue value={row.notional} currency={row.notionalCurrency} />,
          },
          {
            label: '逐笔费用 fee',
            value: (
              <DecimalValue value={row.fee} unavailableLabel="未知（接口固定返回 null，不分摊订单费用）" />
            ),
          },
          { label: '官方 quoteCurrency', value: row.quoteCurrency ?? '未知（null，不推测为结算币种）' },
          { label: '成交时间 filledAt UTC', value: <UtcValue value={row.filledAt} /> },
          { label: '官方更新时间 updatedAt UTC', value: <UtcValue value={row.updatedAt} /> },
        ]}
      />
      <Text as="p" size="sm" color="secondary">
        详情来自当前已返回行，不请求成交详情接口。官方订单 ID 不是本地订单
        UUID，不链接到本地订单详情；官方历史不提供本地任务 UUID、所有者或预留字段。
      </Text>
    </section>
  );
}

export function TradeTable({
  data,
  accountId,
  onPageChange,
  onPageSizeChange,
}: {
  readonly data: OfficialTradesResponse;
  readonly accountId: string;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (size: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const columns = useMemo<ColumnDef<typeof tableFeatures, OfficialTradeRow>[]>(
    () => [
      { accessorKey: 'exchangeTradeId', header: '官方成交 ID', enableHiding: false },
      { accessorKey: 'exchangeOrderId', header: '官方订单 ID' },
      { accessorKey: 'symbol', header: '证券' },
      { accessorKey: 'side', header: '方向', cell: ({ row }) => <StatusValue value={row.original.side} /> },
      {
        accessorKey: 'price',
        header: '成交价 USD',
        cell: ({ row }) => <DecimalValue value={row.original.price} currency={row.original.priceCurrency} />,
      },
      {
        accessorKey: 'quantity',
        header: '成交股数',
        cell: ({ row }) => <DecimalValue value={row.original.quantity} />,
      },
      {
        accessorKey: 'notional',
        header: '名义金额 USD',
        cell: ({ row }) => (
          <DecimalValue value={row.original.notional} currency={row.original.notionalCurrency} />
        ),
      },
      {
        accessorKey: 'fee',
        header: '逐笔费用',
        cell: ({ row }) => <DecimalValue value={row.original.fee} unavailableLabel="未知（null）" />,
      },
      {
        accessorKey: 'filledAt',
        header: '成交时间 UTC',
        cell: ({ row }) => <UtcValue value={row.original.filledAt} />,
      },
      {
        id: 'detail',
        header: '已加载行',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            label={`查看成交 ${row.original.exchangeTradeId}`}
            variant="ghost"
            size="sm"
            aria-expanded={selectedId === row.original.exchangeTradeId}
            aria-controls={selectedId === row.original.exchangeTradeId ? 'official-trade-details' : undefined}
            onClick={() =>
              setSelectedId((current) =>
                current === row.original.exchangeTradeId ? null : row.original.exchangeTradeId,
              )
            }
          />
        ),
      },
    ],
    [selectedId],
  );
  const selected = data.items.find((row) => row.exchangeTradeId === selectedId);
  return (
    <>
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
        getRowId={(row) => row.exchangeTradeId}
        emptyTitle="当前官方历史页未返回成交"
        emptyDescription="仅代表本账户与固定筛选窗口的本页结果，不表示完整账户历史或任意证券库存。"
      />
      {selected ? (
        <TradeDetails row={selected} accountId={accountId} />
      ) : selectedId ? (
        <Text as="p" role="status">
          所选成交不在当前返回页；未加载不代表不存在，也没有独立详情接口。
        </Text>
      ) : null}
    </>
  );
}
