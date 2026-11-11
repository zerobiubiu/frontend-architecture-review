import { Banner } from '@astryxdesign/core';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import type { QuoteDto } from './api';
import type { DisplayedMarketQuote } from './quote-selection';

const COLUMNS: ColumnDef<typeof tableFeatures, QuoteDto>[] = [
  { accessorKey: 'symbol', header: '证券代码', enableHiding: false },
  {
    accessorKey: 'bid',
    header: '买一价 · bid',
    cell: ({ row }) => <DecimalValue value={row.original.bid} />,
  },
  {
    accessorKey: 'bidSize',
    header: '买一量 · bidSize',
    cell: ({ row }) => <DecimalValue value={row.original.bidSize} />,
  },
  {
    accessorKey: 'ask',
    header: '卖一价 · ask',
    cell: ({ row }) => <DecimalValue value={row.original.ask} />,
  },
  {
    accessorKey: 'askSize',
    header: '卖一量 · askSize',
    cell: ({ row }) => <DecimalValue value={row.original.askSize} />,
  },
  {
    accessorKey: 'tradingStatus',
    header: '交易状态',
    cell: ({ row }) => <StatusValue value={row.original.tradingStatus} />,
  },
];

function MillisecondTime({ value }: { readonly value: number | null }) {
  return value === null ? <span>未知（未提供）</span> : <UtcValue value={new Date(value).toISOString()} />;
}

export function QuoteBook({ value }: { readonly value: DisplayedMarketQuote }) {
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const data = useMemo(() => [value.quote], [value.quote]);
  return (
    <section aria-label="当前选择的报价" className="flex min-w-0 flex-col gap-3">
      <Banner
        status={value.isLive ? 'info' : 'warning'}
        title={value.isLive ? '近期已接收推送 · 仅展示参考' : '非实时 · 最后取得的报价'}
        description={
          value.transport === 'REST'
            ? 'REST 快照不代表当前流行情；交易所事件时间与源时间均未提供。'
            : value.stale
              ? '连接中断或已超过客户端展示参考阈值；旧值不得视为 live 或可执行价格。'
              : '已收到有效推送，但这不证明可成交、权限就绪或交易所价格持续有效。'
        }
      />
      <DataTableShell
        data={data}
        columns={COLUMNS}
        pagination={false}
        title="买卖盘口"
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        getRowId={(row) => row.symbol}
      />
      <DefinitionList
        items={[
          { label: '报价来源', value: <StatusValue value={value.quote.source} /> },
          { label: '当前显示的传输来源', value: <StatusValue value={value.transport} /> },
          { label: '后端接收时间（不是交易所时间）', value: <UtcValue value={value.quote.timestamp} /> },
          { label: '时间来源', value: <StatusValue value={value.quote.timestampSource} /> },
          { label: '行情事件时间 · eventTimestamp', value: <MillisecondTime value={value.eventTimestamp} /> },
          { label: '行情源时间 · sourceTimestamp', value: <MillisecondTime value={value.sourceTimestamp} /> },
        ]}
      />
    </section>
  );
}
