import { z } from 'zod';
import { isDecimalString } from '@/lib/decimal/decimal';

/** 仅校验原十进制文本，不规范化、不转数值，也不承诺可进行任意精度计算。 */
export const decimalTextSchema = z.string().refine(isDecimalString, '必须为十进制字符串');
export const nullableDecimalTextSchema = decimalTextSchema.nullable();
export const uuidSchema = z.uuid();
/** 历史时间是只读原文；可转换性由展示层说明，不套用新输入的六位精度限制。 */
export const rawTimeSchema = z.string().min(1);
export const nonnegativeCountSchema = z.number().int().nonnegative().safe();

/** 仅供真实返回此分页协议的接口使用；全量数组/未解决记录不包装成分页。 */
export function pagedSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    total: nonnegativeCountSchema,
    page: z.number().int().positive().safe(),
    pageSize: z.number().int().min(1).max(100),
  });
}
