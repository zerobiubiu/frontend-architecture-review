import Decimal from 'decimal.js';

/**
 * 项目专用十进制上下文。
 *
 * decimal.js 默认 precision=20（有效数字）且舍入到该精度，`.plus()` 等运算会受其约束。
 * 这里使用独立 clone，避免修改全局 Decimal：
 * - 协议上限：金额 numeric(38,18)、股数 numeric(30,10)，即最多 38 位有效数字；
 * - 50 位为求和/进位/多行累计留出 12 位余量（100 万行累计仅增加 6 位整数位）；
 * - 输入超过 50 位有效数字直接拒绝，不静默舍入；舍入只可能发生在业务协议之外的超界运算。
 * - 展示格式化由 Intl 完成，不把舍入结果写回提交值。
 */
export const DECIMAL_CONTEXT_PRECISION = 50;
export const DECIMAL_MAX_SIGNIFICANT_DIGITS = 50;

const DecimalContext = Decimal.clone({
  precision: DECIMAL_CONTEXT_PRECISION,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -100,
  toExpPos: 100,
});

export type DecimalParseResult =
  | { readonly ok: true; readonly value: Decimal }
  | { readonly ok: false; readonly reason: 'empty' | 'format' | 'precision' };

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
  const parsed = new DecimalContext(value);
  if (!parsed.isFinite()) return { ok: false, reason: 'format' };
  if (parsed.sd() > DECIMAL_MAX_SIGNIFICANT_DIGITS) return { ok: false, reason: 'precision' };
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
 * 不做四舍五入、不做位数截断、不做范围钳制；输出保持普通十进制（无指数），
 * 且必须仍能被 `parseDecimal` 以相同数值读回。
 */
export function normalizeDecimalText(value: string): string | null {
  const parsed = parseDecimal(value);
  if (!parsed.ok) return null;
  return parsed.value.isNegative() && parsed.value.isZero() ? '0' : parsed.value.toString();
}
