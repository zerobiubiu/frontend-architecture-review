import { describe, expect, it } from 'vitest';
import {
  compareDecimal,
  isDecimalString,
  normalizeDecimalText,
  parseDecimal,
  sumDecimal,
} from '@/lib/decimal/decimal';

describe('decimal 字符串工具', () => {
  it('识别合法与非法十进制字符串', () => {
    for (const value of ['0', '-1', '+2.5', '.5', '5.', '1234567890.123456789012345678']) {
      expect(isDecimalString(value), value).toBe(true);
    }
    for (const value of ['', ' 1', '1 ', '1e3', 'NaN', 'Infinity', '1,000', '0x10', '--1', '1.2.3']) {
      expect(isDecimalString(value), value).toBe(false);
    }
  });

  it('解析不丢失精度', () => {
    const parsed = parseDecimal('0.123456789012345678');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.toString()).toBe('0.123456789012345678');
  });

  it('空值与非法值返回明确原因', () => {
    expect(parseDecimal('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseDecimal('1e3')).toEqual({ ok: false, reason: 'format' });
    expect(parseDecimal(' 1')).toEqual({ ok: false, reason: 'format' });
  });

  it('精确比较，不经过 Number', () => {
    expect(compareDecimal('0.1', '0.10')).toBe(0);
    expect(compareDecimal('0.10000000000000001', '0.1')).toBe(1);
    expect(compareDecimal('-2', '-10')).toBe(1);
    expect(compareDecimal('1', 'abc')).toBeNull();
  });

  it('精确求和', () => {
    expect(sumDecimal(['0.1', '0.2'])).toBe('0.3');
    expect(sumDecimal(['1', '-1'])).toBe('0');
    expect(sumDecimal(['9007199254740993', '1'])).toBe('9007199254740994');
    expect(sumDecimal([])).toBe('0');
    expect(sumDecimal(['1', 'oops'])).toBeNull();
  });

  it('规范化只改格式，不改变数值', () => {
    expect(normalizeDecimalText('+1.50')).toBe('1.5');
    expect(normalizeDecimalText('5.')).toBe('5');
    expect(normalizeDecimalText('-0')).toBe('0');
    expect(normalizeDecimalText('1.234567890123456789')).toBe('1.234567890123456789');
    expect(normalizeDecimalText('x')).toBeNull();
  });
});

describe('十进制计算上下文（不再依赖 decimal.js 默认 20 位）', () => {
  it('12 整数 + 18 小数的多个协议值求和保持精确', () => {
    expect(sumDecimal(['999999999999.123456789012345678', '0.000000000000000001'])).toBe(
      '999999999999.123456789012345679',
    );
  });

  it('尾数进位与最大值附近的累加不丢位', () => {
    expect(sumDecimal(['999999999999999999999999999.999999999999999999', '0.000000000000000001'])).toBe(
      '1000000000000000000000000000',
    );
    expect(sumDecimal(['999999999999.123456789012345678', '0.000000000000000001'])).toBe(
      '999999999999.123456789012345679',
    );
  });

  it('多行累计保持精确（1000 × 1e-18）', () => {
    const rows = Array.from({ length: 1000 }, () => '0.000000000000000001');
    expect(sumDecimal(rows)).toBe('0.000000000000001');
  });

  it('正负抵消得到精确 0', () => {
    expect(sumDecimal(['999999999999.123456789012345678', '-999999999999.123456789012345678'])).toBe('0');
  });

  it('超过上下文精度的输入明确拒绝，而不是静默舍入', () => {
    const tooLong = `1.${'1234567890'.repeat(5)}1`;
    const parsed = parseDecimal(tooLong);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe('precision');
    expect(sumDecimal([tooLong])).toBeNull();
  });

  it('规范化输出仍是同一解析器可读的普通十进制文本', () => {
    for (const value of ['0.00000001', '-0.000000000000000001']) {
      const normalized = normalizeDecimalText(value);
      expect(normalized, value).not.toBeNull();
      if (normalized !== null) {
        expect(normalized).not.toMatch(/[eE]/);
        expect(isDecimalString(normalized)).toBe(true);
        expect(compareDecimal(normalized, value)).toBe(0);
      }
    }
  });
});
