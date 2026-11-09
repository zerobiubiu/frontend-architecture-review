import { isDecimalString } from '@/lib/decimal/decimal';

export interface DecimalFormatOptions {
  readonly locale?: string;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean;
  readonly signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
}

/**
 * 用 Intl 格式化十进制字符串，不先转 Number，因此不会引入二进制浮点误差。
 * 仅用于展示；格式化结果不得回填表单或提交。
 * 非法输入返回 null（未知不显示为 0）。
 */
export function formatDecimal(value: string, options: DecimalFormatOptions = {}): string | null {
  if (!isDecimalString(value)) return null;
  const formatter = new Intl.NumberFormat(options.locale ?? 'zh-CN', {
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits,
    useGrouping: options.useGrouping ?? true,
    signDisplay: options.signDisplay ?? 'auto',
  });
  // Intl.NumberFormat#format 在运行时接受十进制字符串并精确格式化；类型声明只接受 number/bigint。
  return formatter.format(value as unknown as number);
}

/** 价格：最多两位小数，仅展示；不改变原值。 */
export function formatPrice(value: string, locale = 'zh-CN'): string | null {
  return formatDecimal(value, { locale, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 未知值统一呈现为占位符，避免把 null 显示成 0。 */
export function formatUnknown(value: string | null | undefined, placeholder = '—'): string {
  return value ?? placeholder;
}
