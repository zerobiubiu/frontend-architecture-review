import { describe, expect, it } from 'vitest';
import { formatDecimal, formatPrice, formatUnknown } from '@/lib/format/number';

describe('Intl 十进制展示', () => {
  it('按字符串精确格式化，不引入浮点误差', () => {
    expect(formatDecimal('0.1', { maximumFractionDigits: 1 })).toBe('0.1');
    expect(formatDecimal('0.123456789012345678', { maximumFractionDigits: 18 })).toBe('0.123456789012345678');
    expect(formatDecimal('123456789012345678.9', { useGrouping: false })).toBe('123456789012345678.9');
  });

  it('价格只做展示舍入（两位），原值不受影响', () => {
    expect(formatPrice('1234.5')).toBe('1,234.50');
    expect(formatPrice('-0.005')).toBe('-0.01');
    const original = '1234.567';
    expect(formatPrice(original)).toBe('1,234.57');
    expect(original).toBe('1234.567');
  });

  it('非法输入返回 null，未知不显示为 0', () => {
    expect(formatDecimal('abc')).toBeNull();
    expect(formatDecimal('')).toBeNull();
    expect(formatUnknown(null)).toBe('—');
    expect(formatUnknown(undefined, '未知')).toBe('未知');
  });
});
