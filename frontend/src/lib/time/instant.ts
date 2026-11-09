/**
 * UTC 时间文本工具。
 *
 * 约束：金额与时间都不得经过 JavaScript Number/Date 做“无损往返”。
 * - 原始 UTC 字符串是唯一权威值，随表单原样提交；
 * - 小数秒最多六位，超出即报错，绝不四舍五入或截断；
 * - Date 只用于按 IANA 时区展示，展示值不回写。
 */

export interface UtcInstant {
  /** 原始 UTC 文本，保留作者输入的小数秒位数。 */
  readonly raw: string;
  /** 仅用于展示与比较的毫秒精度时间戳；不含原始六位小数秒的后三位。 */
  readonly epochMillis: number;
  /** 原始小数秒（不含小数点），没有则为空串。 */
  readonly fraction: string;
}

export type TimeFieldFailureCode = 'empty' | 'format' | 'calendar' | 'fraction-digits';

export type TimeParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: TimeFieldFailureCode; readonly message: string };

export interface WallClockFields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly fraction: string;
}

const UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;
const WALL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;

const MAX_FRACTION_DIGITS = 6;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

function validateFields(fields: Omit<WallClockFields, 'fraction'>, fraction: string): TimeParseResult<null> {
  if (fields.month < 1 || fields.month > 12) {
    return { ok: false, code: 'calendar', message: '月份必须在 01–12 之间' };
  }
  if (fields.day < 1 || fields.day > daysInMonth(fields.year, fields.month)) {
    return { ok: false, code: 'calendar', message: '日期在该月不存在' };
  }
  if (fields.hour > 23 || fields.minute > 59 || fields.second > 59) {
    return { ok: false, code: 'calendar', message: '时间必须在 00:00:00–23:59:59 之间' };
  }
  if (fraction.length > MAX_FRACTION_DIGITS) {
    return { ok: false, code: 'fraction-digits', message: '小数秒最多六位' };
  }
  return { ok: true, value: null };
}

function toFields(match: RegExpMatchArray): { fields: Omit<WallClockFields, 'fraction'>; fraction: string } {
  return {
    fields: {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6]),
    },
    fraction: match[7] ?? '',
  };
}

/** 把 UTC 字段换算为毫秒时间戳；用 setUTCFullYear 兼容 0–99 年。 */
export function utcMillisFromFields(fields: WallClockFields): number {
  const date = new Date(0);
  date.setUTCFullYear(fields.year, fields.month - 1, fields.day);
  date.setUTCHours(fields.hour, fields.minute, fields.second, fractionToMillis(fields.fraction));
  return date.getTime();
}

function fractionToMillis(fraction: string): number {
  return fraction.length === 0 ? 0 : Number(fraction.padEnd(3, '0').slice(0, 3));
}

export function parseUtcInstant(input: string): TimeParseResult<UtcInstant> {
  if (input.length === 0) return { ok: false, code: 'empty', message: '请输入 UTC 时间' };
  const match = input.match(UTC_PATTERN);
  if (!match) {
    return {
      ok: false,
      code: 'format',
      message: '格式必须为 YYYY-MM-DDTHH:mm:ss[.ffffff]Z（UTC，Z 结尾）',
    };
  }
  const { fields, fraction } = toFields(match);
  const validated = validateFields(fields, fraction);
  if (!validated.ok) return validated;
  return {
    ok: true,
    value: {
      raw: input,
      epochMillis: utcMillisFromFields({ ...fields, fraction }),
      fraction,
    },
  };
}

/** 解析“无时区墙钟”文本，供纽约时间输入使用。 */
export function parseWallClockText(input: string): TimeParseResult<WallClockFields> {
  if (input.length === 0) return { ok: false, code: 'empty', message: '请输入时间' };
  const match = input.match(WALL_PATTERN);
  if (!match) {
    return { ok: false, code: 'format', message: '格式必须为 YYYY-MM-DD HH:mm:ss[.ffffff]' };
  }
  const { fields, fraction } = toFields(match);
  const validated = validateFields(fields, fraction);
  if (!validated.ok) return validated;
  return { ok: true, value: { ...fields, fraction } };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** 由墙钟字段生成 UTC 文本；小数秒按原样保留（含尾零），不做截断。 */
export function utcTextFromFields(fields: WallClockFields): string {
  const date = new Date(utcMillisFromFields(fields));
  const datePart = `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const timePart = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  const fractionPart = fields.fraction.length > 0 ? `.${fields.fraction}` : '';
  return `${datePart}T${timePart}${fractionPart}Z`;
}

/** 读取某时刻在指定 IANA 时区的墙钟字段（秒精度）。 */
export function zonedFieldsAt(epochMillis: number, timeZone: string): WallClockFields {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(epochMillis));
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '0';
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
    second: Number(pick('second')),
    fraction: '',
  };
}

/** 以 `YYYY-MM-DD HH:mm:ss` 形式返回某时刻在指定时区的墙钟。 */
export function formatEpochInZone(epochMillis: number, timeZone: string): string {
  const wall = zonedFieldsAt(epochMillis, timeZone);
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)} ${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
}

/** 在指定 IANA 时区格式化时间；小数秒原样附加，展示舍入不回写。 */
export function formatInstantInZone(instant: UtcInstant, timeZone: string): string {
  const wall = formatEpochInZone(instant.epochMillis, timeZone);
  return instant.fraction.length > 0 ? `${wall}.${instant.fraction}` : wall;
}

/** 指定时区在该时刻相对 UTC 的偏移（分钟），用于 DST 消歧展示。 */
export function offsetMinutesAt(epochMillis: number, timeZone: string): number {
  const wall = zonedFieldsAt(epochMillis, timeZone);
  const wallMillis = utcMillisFromFields(wall);
  return Math.round((wallMillis - epochMillis) / 60_000);
}

const NEW_YORK = 'America/New_York';

export const TIME_ZONES = {
  utc: 'UTC',
  newYork: NEW_YORK,
} as const;
