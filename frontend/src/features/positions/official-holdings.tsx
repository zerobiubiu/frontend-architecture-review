import { Button, Text } from '@astryxdesign/core';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import type { HoldingRow, HoldingsResponse } from './types';

export function OfficialHoldings({ data }: { readonly data: HoldingsResponse }) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const columns = useMemo<ColumnDef<typeof tableFeatures, HoldingRow>[]>(
    () => [
      { accessorKey: 'symbol', header: '证券', enableHiding: false },
      { accessorKey: 'assetCode', header: '官方资产代码' },
      { accessorKey: 'stockTicker', header: '官方 stockTicker' },
      {
        accessorKey: 'fundingFreeQuantity',
        header: 'Funding free 股数',
        cell: ({ row }) => <DecimalValue value={row.original.fundingFreeQuantity} />,
      },
      {
        accessorKey: 'lockedQuantity',
        header: 'locked 股数',
        cell: ({ row }) => <DecimalValue value={row.original.lockedQuantity} />,
      },
      {
        accessorKey: 'freezeQuantity',
        header: 'freeze 股数',
        cell: ({ row }) => <DecimalValue value={row.original.freezeQuantity} />,
      },
      {
        accessorKey: 'withdrawingQuantity',
        header: 'withdrawing 股数',
        cell: ({ row }) => <DecimalValue value={row.original.withdrawingQuantity} />,
      },
      {
        id: 'detail',
        header: '已加载候选',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            label={`查看 ${row.original.symbol} 官方候选`}
            variant="ghost"
            size="sm"
            aria-expanded={selectedSymbol === row.original.symbol}
            aria-controls={selectedSymbol === row.original.symbol ? 'official-holding-details' : undefined}
            onClick={() =>
              setSelectedSymbol((current) => (current === row.original.symbol ? null : row.original.symbol))
            }
          />
        ),
      },
    ],
    [selectedSymbol],
  );
  const selected = data.items.find((row) => row.symbol === selectedSymbol);
  return (
    <>
      <DefinitionList
        items={[
          { label: '官方候选账户 UUID', value: data.accountId },
          { label: '来源', value: <StatusValue value={data.source} /> },
          { label: '本次请求时间 requestedAt（本地 UTC）', value: <UtcValue value={data.requestedAt} /> },
          { label: '本次接收时间 receivedAt（本地 UTC）', value: <UtcValue value={data.receivedAt} /> },
          {
            label: '上游更新时间 sourceUpdatedAt',
            value: (
              <>
                <UtcValue value={data.sourceUpdatedAt} />
                ；服务端明确返回 null，未提供上游更新时间。
              </>
            ),
          },
        ]}
      />
      <DataTableShell
        data={data.items}
        columns={columns}
        pagination={false}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        getRowId={(row) => row.symbol}
        emptyTitle="本次官方读取未返回股票候选"
        emptyDescription="空数组或缺少某证券行不等于该证券已确认零库存；不从本地名义持仓补行。"
      />
      {selected ? (
        <section
          id="official-holding-details"
          aria-label="已加载官方候选详情"
          className="flex min-w-0 flex-col gap-3"
        >
          <Text as="h3" size="base" weight="semibold">
            {selected.symbol} · 官方候选详情
          </Text>
          <DefinitionList
            items={[
              { label: '证券 symbol', value: selected.symbol },
              { label: '官方股票身份 stockTicker', value: selected.stockTicker },
              { label: '官方资产身份 assetCode', value: selected.assetCode },
              {
                label: '精确身份核验',
                value: 'stockTicker = symbol；assetCode = EQ_ + symbol（公开 schema 已校验）',
              },
              { label: 'Funding free 股数', value: <DecimalValue value={selected.fundingFreeQuantity} /> },
              { label: 'locked 股数', value: <DecimalValue value={selected.lockedQuantity} /> },
              { label: 'freeze 股数', value: <DecimalValue value={selected.freezeQuantity} /> },
              { label: 'withdrawing 股数', value: <DecimalValue value={selected.withdrawingQuantity} /> },
              { label: '上游更新时间', value: '未知（sourceUpdatedAt = null）' },
            ]}
          />
        </section>
      ) : selectedSymbol ? (
        <Text as="p" role="status">
          所选证券未在本次候选中返回；不据此补零。
        </Text>
      ) : null}
      <Text as="p" size="sm" color="secondary">
        候选没有分页或排序承诺。free、locked、freeze、withdrawing 独立展示、不相加；free
        为零仍可能有锁定候选。
        本次接收不是上游更新时间，也不是执行时库存证据。外部账户活动没有保证送达的业务通知，需重新读取确认。
      </Text>
    </>
  );
}
