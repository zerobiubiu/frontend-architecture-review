import type { AuthUser } from './types';

export const CAPABILITY_LABELS = {
  workspace: '工作台',
  trading: '交易执行',
  administration: '系统管理',
  'manage-admins': '管理员授权',
} as const;
export type Capability = keyof typeof CAPABILITY_LABELS;

/** 导航、路由及资源注册复用同一角色政策；管理员不继承交易员写权限。 */
export function hasCapability(user: AuthUser, capability: Capability): boolean {
  switch (capability) {
    case 'workspace':
      return true;
    case 'trading':
      return user.role === 'TRADER';
    case 'administration':
      return user.role === 'ADMIN';
    case 'manage-admins':
      return user.role === 'ADMIN' && user.canManageAdmins;
  }
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && Object.hasOwn(CAPABILITY_LABELS, value);
}
