import { Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, UtcValue } from '@/components/read-only/values';
import type { LedgerEntry } from './schemas';

export function LedgerEntryDetails({ entry }: { readonly entry: LedgerEntry }) {
  return (
    <section aria-label="已加载流水详情" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" size="lg" weight="semibold">
        已加载流水详情
      </Text>
      <DefinitionList
        items={[
          { label: '本地流水 UUID', value: entry.id },
          { label: '流水类型', value: entry.type },
          {
            label: '账户',
            value: (
              <Link to="/accounts/$id" params={{ id: entry.exchangeAccountId }}>
                {entry.exchangeAccountId}
              </Link>
            ),
          },
          { label: '所有者', value: entry.ownerUserId },
          { label: '金额原文（含服务端符号）', value: <code className="break-all">{entry.amount}</code> },
          { label: '金额与币种', value: <DecimalValue value={entry.amount} currency={entry.currency} /> },
          { label: '币种', value: entry.currency ?? '未知，不能按其他流水推断' },
          {
            label: 'balanceAfter',
            value: (
              <DecimalValue
                value={entry.balanceAfter}
                currency={entry.currency}
                unavailableLabel="未知；不能累计流水补造余额"
              />
            ),
          },
          {
            label: '关联本地订单',
            value: entry.orderId ? (
              <Link to="/orders/$id" params={{ id: entry.orderId }}>
                {entry.orderId}
              </Link>
            ) : (
              '未关联'
            ),
          },
          { label: '关联本地成交 UUID', value: entry.tradeId ?? '未关联' },
          { label: '说明', value: entry.description },
          { label: '创建时间（筛选依据）', value: <UtcValue value={entry.createdAt} /> },
          { label: '记录更新时间', value: <UtcValue value={entry.updatedAt} /> },
          { label: '来源', value: 'LOCAL_LEDGER · 本地账本' },
        ]}
      />
      <Text as="p" size="sm" color="secondary">
        仅展开当前页已取得的记录；没有流水详情
        GET。关联订单可读取，但不代表官方现金结算、原操作身份或盈亏已核实。
      </Text>
    </section>
  );
}
