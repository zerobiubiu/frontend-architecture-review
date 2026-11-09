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
