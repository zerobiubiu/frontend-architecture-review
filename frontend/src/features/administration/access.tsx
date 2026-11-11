import { Banner, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { useQueryScope } from '@/app/business-sync/use-resource-query';
import { hasCapability } from '@/features/auth/permissions';

export function useAdminReadDenial(): string | undefined {
  const { user } = useQueryScope();
  if (!user) return '会话身份尚未确认，管理数据未读取。';
  if (!hasCapability(user, 'administration')) return '仅 ADMIN 可读取管理数据；TRADER 无管理读取权限。';
  return undefined;
}

export function AdministrationAccess() {
  const { user } = useQueryScope();
  if (!user || !hasCapability(user, 'administration')) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <nav aria-label="管理只读页面" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link to="/administration" className="underline underline-offset-4">
          管理概览
        </Link>
        <Link to="/administration/users" className="underline underline-offset-4">
          用户
        </Link>
        <Link to="/administration/accounts" className="underline underline-offset-4">
          管理账户
        </Link>
        <Link to="/administration/audit" className="underline underline-offset-4">
          审计
        </Link>
        <Link to="/administration/system" className="underline underline-offset-4">
          系统
        </Link>
      </nav>
      <Banner
        status="info"
        title="管理员只读视图"
        description="普通 ADMIN 也可读取所有用户（包括管理员）。本阶段不提供创建、编辑、状态变更、删除、授权、风控修改或测速操作。管理 GET 可能记录服务端审计。"
      />
      <Text as="p" size="sm" color="secondary">
        当前身份：{user.username} · {user.role} · canManageAdmins：
        {user.canManageAdmins ? 'true（持有专项权限）' : 'false（不持有专项权限）'}。
        专项标志不影响本页读取，也不使 ADMIN 获得交易执行权限。
      </Text>
    </div>
  );
}
