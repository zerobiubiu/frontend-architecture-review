import { describe, expect, it } from 'vitest';
import { hasCapability } from '@/features/auth/permissions';
import { safeReturnTo } from '@/features/auth/return-to';
import { ADMIN_USER, OWNER_USER, TRADER_USER } from '../msw/auth-fixtures';

describe('角色能力不相互继承', () => {
  it('交易员可进入工作台和交易执行，但不能管理用户', () => {
    expect(hasCapability(TRADER_USER, 'workspace')).toBe(true);
    expect(hasCapability(TRADER_USER, 'trading')).toBe(true);
    expect(hasCapability(TRADER_USER, 'administration')).toBe(false);
    expect(hasCapability(TRADER_USER, 'manage-admins')).toBe(false);
  });
  it('管理员不继承交易员写权限，专项授权独立判断', () => {
    expect(hasCapability(ADMIN_USER, 'administration')).toBe(true);
    expect(hasCapability(ADMIN_USER, 'trading')).toBe(false);
    expect(hasCapability(ADMIN_USER, 'manage-admins')).toBe(false);
    expect(hasCapability(OWNER_USER, 'manage-admins')).toBe(true);
    expect(hasCapability(OWNER_USER, 'trading')).toBe(false);
  });
});

describe('returnTo 只允许已注册站内地址', () => {
  it.each([
    'https://evil.invalid',
    '//evil.invalid',
    '/\\evil.invalid',
    '/%2f%2fevil.invalid',
    '/admin',
    '/login',
    '/\n/evil.invalid',
    null,
    ['//evil.invalid'],
  ])('拒绝站外、控制字符或未开放目标 %j', (input) => {
    expect(safeReturnTo(input, false)).toBe('/');
  });
  it('保留允许目标的查询和片段，开发探针不能进入生产目标集', () => {
    expect(safeReturnTo('/?view=identity#session', false)).toBe('/?view=identity#session');
    expect(safeReturnTo('/dev/access/administration', true)).toBe('/dev/access/administration');
    expect(safeReturnTo('/dev/access/administration', false)).toBe('/');
  });
  it('业务详情返回保留完整筛选与片段，但无效对象和未注册子路径不能进入', () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const target = `/orders/${id}?accountId=${id}&page=2#fees`;
    expect(safeReturnTo(target, false)).toBe(target);
    expect(safeReturnTo('/orders/not-an-id?accountId=other', false)).toBe('/');
    expect(safeReturnTo(`/orders/${id}/cancel`, false)).toBe('/');
    expect(safeReturnTo(`/administration/users/${id}?page=1`, false)).toBe(
      `/administration/users/${id}?page=1`,
    );
  });
});
