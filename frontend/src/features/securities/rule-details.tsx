import { Text } from '@astryxdesign/core';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { EquityRule } from './schemas';

export function RuleFlag({ value }: { readonly value: boolean | null }) {
  return <span>{value === null ? '未知（未返回）' : value ? '支持' : '不支持'}</span>;
}

function RuleTime({ value }: { readonly value: number | null }) {
  if (value === null) return <span>未知（未返回）</span>;
  return (
    <span className="flex flex-col gap-1">
      <UtcValue value={new Date(value).toISOString()} />
      <span className="text-secondary text-xs tabular-nums">原始 epoch ms：{value}</span>
    </span>
  );
}

export function SecurityRuleDetails({ rule }: { readonly rule: EquityRule }) {
  return (
    <section aria-label={`${rule.symbol} 已返回交易规则`} className="flex min-w-0 flex-col gap-3">
      <Text as="h2" size="lg" weight="semibold">
        {rule.symbol} · 已返回交易规则
      </Text>
      <Text as="p" size="sm" color="secondary">
        仅展开当前目录响应中的这一行；没有独立证券详情接口。未知不代表不受限制，目录也不替代执行时官方校验。
      </Text>
      <DefinitionList
        items={[
          { label: '证券代码', value: rule.symbol },
          { label: '可交易方向 · tradability', value: <StatusValue value={rule.tradability} /> },
          { label: '盘前盘后 · extendedSession', value: <RuleFlag value={rule.extendedSession} /> },
          { label: '隔夜 · overnightSupported', value: <RuleFlag value={rule.overnightSupported} /> },
          { label: '碎股 · fractionable', value: <RuleFlag value={rule.fractionable} /> },
          { label: '延长时段碎股 · fractionableEh', value: <RuleFlag value={rule.fractionableEh} /> },
          { label: '股数步长 · stepSize', value: <DecimalValue value={rule.stepSize} /> },
          { label: '最小股数 · minQuantity', value: <DecimalValue value={rule.minQuantity} /> },
          { label: '最大股数 · maxQuantity', value: <DecimalValue value={rule.maxQuantity} /> },
          { label: '最小名义金额 · minNotional', value: <DecimalValue value={rule.minNotional} /> },
          { label: '最大名义金额 · maxNotional', value: <DecimalValue value={rule.maxNotional} /> },
          { label: '最大挂单数 · maxNumOrders', value: rule.maxNumOrders ?? '未知（未返回）' },
          { label: '上市时间 · listingTime', value: <RuleTime value={rule.listingTime} /> },
          { label: '退市时间 · delistingTime', value: <RuleTime value={rule.delistingTime} /> },
        ]}
      />
    </section>
  );
}
