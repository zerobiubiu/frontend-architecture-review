import { Badge, Text } from '@astryxdesign/core';
import { formatDecimal } from '@/lib/format/number';
import { formatInstantInZone, parseUtcInstant, TIME_ZONES } from '@/lib/time/instant';

interface DecimalValueProps {
  readonly value: string | null | undefined;
  readonly currency?: string | null;
  readonly unavailableLabel?: string;
}

export function DecimalValue({ value, currency, unavailableLabel = '未知' }: DecimalValueProps) {
  if (value === null || value === undefined || value === '') {
    return (
      <Text size="sm" color="secondary">
        {unavailableLabel}
      </Text>
    );
  }

  const decimalPoint = value.indexOf('.');
  const fractionDigits = decimalPoint < 0 ? 0 : value.length - decimalPoint - 1;
  let formatted: string | null = null;
  try {
    formatted = formatDecimal(value, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    // 只检查展示结果；不规范化原值。旧 Intl 的精度损失、Infinity 或符号变化均回退原串。
    if (formatted?.replaceAll(',', '') !== value) formatted = null;
  } catch {
    // Intl 的小数位能力因运行时而异；超出能力不能改精度或钳制金额。
  }

  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1 gap-y-1 text-sm">
      <span className="break-all tabular-nums" title={value}>
        {formatted ?? value}
      </span>
      {currency ? <span>{currency}</span> : null}
      {formatted === null ? (
        <Text size="sm" color="secondary">
          未能无损格式化，显示原值
        </Text>
      ) : null}
    </span>
  );
}

interface UtcValueProps {
  readonly value: string | null | undefined;
}

export function UtcValue({ value }: UtcValueProps) {
  if (value === null || value === undefined || value === '') {
    return (
      <Text size="sm" color="secondary">
        未知
      </Text>
    );
  }

  const parsed = parseUtcInstant(value);
  let converted: string | null = null;
  if (parsed.ok) {
    try {
      const display = formatInstantInZone(parsed.value, TIME_ZONES.utc);
      // UTC 辅助展示必须与原串逐位一致，不能接受缺失 Intl 字段产生的伪日期。
      if (`${display.replace(' ', 'T')}Z` === value) converted = display;
    } catch {
      // 展示不可用不影响权威原串；不经 Date 重序列化或降低历史精度。
    }
  }

  if (converted === null) {
    return (
      <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="break-all tabular-nums">{value}</span>
        <Text size="sm" color="secondary">
          未转换，保留原始 UTC
        </Text>
      </span>
    );
  }

  return (
    <time className="break-all text-sm tabular-nums" dateTime={value} title={value}>
      {converted} UTC
    </time>
  );
}

interface StatusValueProps {
  readonly value: string | null | undefined;
}

export function StatusValue({ value }: StatusValueProps) {
  return (
    <Badge label={value === null || value === undefined || value === '' ? '未知' : value} variant="neutral" />
  );
}
