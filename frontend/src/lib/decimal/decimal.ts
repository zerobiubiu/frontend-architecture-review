import Decimal from 'decimal.js';

export type DecimalParseResult =
  | { readonly ok: true; readonly value: Decimal }
  | { readonly ok: false; readonly reason: 'empty' | 'format' };

/**
 * 十进制字符串：允许符号、整数或小数；拒绝指数、空白、NaN/Infinity。
 * 金融数值在前后端之间始终以字符串传输，本模块是前端唯一的解析入口。
 */
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value);
}

export function parseDecimal(value: string): DecimalParseResult {
  if (value.length === 0) return { ok: false, reason: 'empty' };
  if (!DECIMAL_PATTERN.test(value)) return { ok: false, reason: 'format' };
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) return { ok: false, reason: 'format' };
  return { ok: true, value: parsed };
}

/** 精确比较；任一侧非法时返回 null，而不是把未知值当成 0。 */
export function compareDecimal(left: string, right: string): number | null {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a.ok || !b.ok) return null;
  return a.value.comparedTo(b.value);
}

/** 精确求和；任一项非法时返回 null，由调用方决定如何呈现未知结果。 */
export function sumDecimal(values: readonly string[]): string | null {
  let total: Decimal | null = null;
  for (const value of values) {
    const parsed = parseDecimal(value);
    if (!parsed.ok) return null;
    total = total === null ? parsed.value : total.plus(parsed.value);
  }
  return total === null ? '0' : total.toString();
}

/**
 * 仅有格式变化、不改变数值的展示用规范化：去掉正号与多余的尾随小数点。
 * 不做四舍五入、不做位数截断、不做范围钳制。
 */
export function normalizeDecimalText(value: string): string | null {
  const parsed = parseDecimal(value);
  if (!parsed.ok) return null;
  return parsed.value.isNegative() && parsed.value.isZero() ? '0' : parsed.value.toString();
}
