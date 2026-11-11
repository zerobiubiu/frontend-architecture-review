import { describe, expect, it } from 'vitest';
import {
  formatInstantInZone,
  offsetMinutesAt,
  parseUtcInstant,
  parseWallClockText,
  utcTextFromFields,
  zonedFieldsAt,
} from '@/lib/time/instant';

function requireInstant(text: string) {
  const parsed = parseUtcInstant(text);
  if (!parsed.ok) throw new Error(`测试用例时间无效: ${text}`);
  return parsed.value;
}

describe('UTC 时间解析与序列化', () => {
  it('保留六位小数秒并原样往返', () => {
    const parsed = requireInstant('2026-03-08T06:30:00.123456Z');
    expect(parsed.fraction).toBe('123456');
    expect(parsed.raw).toBe('2026-03-08T06:30:00.123456Z');
    expect(
      utcTextFromFields({ ...zonedFieldsAt(parsed.epochMillis, 'UTC'), fraction: parsed.fraction }),
    ).toBe('2026-03-08T06:30:00.123456Z');
  });

  it('七位小数秒报错而不是截断', () => {
    const parsed = parseUtcInstant('2026-03-08T06:30:00.1234567Z');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('fraction-digits');
  });

  it('拒绝非 UTC / 非法格式', () => {
    for (const value of [
      '2026-03-08 06:30:00Z',
      '2026-03-08T06:30:00',
      '2026-03-08T06:30Z',
      '2026-3-8T06:30:00Z',
      '',
      ' 2026-03-08T06:30:00Z',
    ]) {
      expect(parseUtcInstant(value).ok, value).toBe(false);
    }
  });

  it('校验日历：月份、日期、闰年与时间范围', () => {
    expect(parseUtcInstant('2024-02-29T00:00:00Z').ok).toBe(true);
    expect(parseUtcInstant('2026-02-29T00:00:00Z').ok).toBe(false);
    expect(parseUtcInstant('2026-04-31T00:00:00Z').ok).toBe(false);
    expect(parseUtcInstant('2026-13-01T00:00:00Z').ok).toBe(false);
    expect(parseUtcInstant('2026-01-01T24:00:00Z').ok).toBe(false);
    expect(parseUtcInstant('2026-01-01T23:60:00Z').ok).toBe(false);
  });

  it('按 IANA 时区展示时保留小数秒，且不回写', () => {
    const instant = requireInstant('2026-03-08T06:30:00.123456Z');
    expect(formatInstantInZone(instant, 'UTC')).toBe('2026-03-08 06:30:00.123456');
    expect(formatInstantInZone(instant, 'America/New_York')).toBe('2026-03-08 01:30:00.123456');
    expect(instant.raw).toBe('2026-03-08T06:30:00.123456Z');
  });

  it('纽约偏移随 DST 变化', () => {
    const winter = requireInstant('2026-01-15T12:00:00Z');
    const summer = requireInstant('2026-07-01T12:00:00Z');
    expect(offsetMinutesAt(winter.epochMillis, 'America/New_York')).toBe(-300);
    expect(offsetMinutesAt(summer.epochMillis, 'America/New_York')).toBe(-240);
  });

  it('解析纽约墙钟文本', () => {
    const parsed = parseWallClockText('2026-11-01 01:30:00.654321');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.hour).toBe(1);
      expect(parsed.value.fraction).toBe('654321');
    }
    expect(parseWallClockText('2026-11-01T01:30:00').ok).toBe(true);
    expect(parseWallClockText('2026-11-01 01:30').ok).toBe(false);
  });
});

describe('时间精度与年份必须与后端有效小数规则一致', () => {
  it('尾随零不增加有效精度，原始字符串仍完整保留', () => {
    const cases = [
      '2026-11-10T01:23:45.123456Z',
      '2026-11-10T01:23:45.123456000Z',
      '2026-11-10T01:23:45.0000000Z',
      '2026-11-10T01:23:45.1234560Z',
    ];
    for (const input of cases) {
      const parsed = parseUtcInstant(input);
      expect(parsed.ok, input).toBe(true);
      if (parsed.ok) expect(parsed.value.raw).toBe(input);
    }
  });

  it('第七位有效小数被拒绝，不四舍五入', () => {
    for (const input of [
      '2026-11-10T01:23:45.1234567Z',
      '2026-11-10T01:23:45.0000001Z',
      '2026-11-10T01:23:45.123456789Z',
    ]) {
      const parsed = parseUtcInstant(input);
      expect(parsed.ok, input).toBe(false);
      if (!parsed.ok) expect(parsed.code).toBe('fraction-digits');
    }
  });

  it('年份范围限定为 0001–9999', () => {
    expect(parseUtcInstant('0000-01-01T00:00:00Z').ok).toBe(false);
    expect(parseUtcInstant('0001-01-01T00:00:00Z').ok).toBe(true);
    expect(parseUtcInstant('9999-12-31T23:59:59.999999Z').ok).toBe(true);
  });

  it('历史未改原值可原样透传（含尾零），提交层不做规范化', () => {
    const stored = '2026-11-10T01:23:45.123456000Z';
    const parsed = parseUtcInstant(stored);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.raw).toBe(stored);
      expect(parsed.value.fraction).toBe('123456000');
      expect(
        utcTextFromFields({
          ...zonedFieldsAt(parsed.value.epochMillis, 'UTC'),
          fraction: parsed.value.fraction,
        }),
      ).toBe(stored);
    }
  });

  it('纽约墙钟同样按有效小数校验', () => {
    expect(parseWallClockText('2026-11-01 01:30:00.123456000').ok).toBe(true);
    expect(parseWallClockText('2026-11-01 01:30:00.1234567').ok).toBe(false);
    expect(parseWallClockText('0000-11-01 01:30:00').ok).toBe(false);
  });
});
