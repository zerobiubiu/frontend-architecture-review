import { z } from 'zod';

const detailIdSchema = z.uuid();
const detailPrefixes = new Set(['accounts', 'orders', 'tasks', 'operations']);
const publicDestinations: Readonly<Record<string, true>> = {
  '/': true,
  '/accounts': true,
  '/securities': true,
  '/market': true,
  '/orders': true,
  '/tasks': true,
  '/positions': true,
  '/trades': true,
  '/ledger': true,
  '/reconciliations': true,
  '/operations': true,
  '/administration': true,
  '/administration/users': true,
  '/administration/accounts': true,
  '/administration/audit': true,
  '/administration/system': true,
};
const developmentDestinations: Readonly<Record<string, true>> = {
  '/dev/access/trading': true,
  '/dev/access/administration': true,
  '/dev/access/manage-admins': true,
};

/** 只接受本阶段已经注册的站内目标，拒绝站外、协议相对、反斜线和控制字符。 */
export function safeReturnTo(value: unknown, development = import.meta.env.DEV): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return '/';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return '/';
  }
  const url = new URL(value, 'https://application.invalid');
  if (url.origin !== 'https://application.invalid') return '/';
  const parts = url.pathname.split('/');
  const detail =
    parts.length === 3 && detailPrefixes.has(parts[1] ?? '') && detailIdSchema.safeParse(parts[2]).success;
  const userDetail =
    parts.length === 4 &&
    parts[1] === 'administration' &&
    parts[2] === 'users' &&
    detailIdSchema.safeParse(parts[3]).success;
  if (
    !Object.hasOwn(publicDestinations, url.pathname) &&
    !detail &&
    !userDetail &&
    !(development && Object.hasOwn(developmentDestinations, url.pathname))
  )
    return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
