import { Banner, Text } from '@astryxdesign/core';
import { Link, useParams } from '@tanstack/react-router';
import { DefinitionList } from '@/components/read-only/object-details';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { StatusValue, UtcValue } from '@/components/read-only/values';
import { uuidSchema } from '@/lib/read-only/schemas';
import { AdministrationAccess, useAdminReadDenial } from './access';
import { useAdminUsers } from './queries';
import { usersSearchSchema } from './schemas';

export function UserDetailPage() {
  const { id } = useParams({ strict: false });
  const parsedId = uuidSchema.safeParse(id);
  const denied = useAdminReadDenial();
  const search = usersSearchSchema.parse({
    ...(parsedId.success ? { ownerUserId: parsedId.data } : {}),
    page: 1,
    pageSize: 1,
  });
  const query = useAdminUsers(search, parsedId.success);
  return (
    <ReadPage
      title="用户只读详情"
      description="通过真实 /admin/users 列表的 ownerUserId → users.id 精确查询定位；不存在用户详情 GET，也不查询密码或其他私密字段。"
    >
      <AdministrationAccess />
      <QuerySurface
        query={query}
        disabledReason={denied ?? (parsedId.success ? undefined : '用户 ID 必须是有效 UUID；未发送查询。')}
        label="用户精确查询"
      >
        {(data) => {
          const user = data.items.find(
            (item) => parsedId.success && item.id.toLowerCase() === parsedId.data.toLowerCase(),
          );
          if (!user)
            return (
              <Banner
                status="warning"
                title="未取得该用户记录"
                description="真实列表没有返回该 ID 的记录；不使用其他用户缓存替代。"
              />
            );
          return (
            <>
              <section aria-labelledby="admin-user-identity-title" className="flex min-w-0 flex-col gap-3">
                <Text as="h2" id="admin-user-identity-title" size="lg" weight="semibold">
                  公开身份与专项权限
                </Text>
                <DefinitionList
                  items={[
                    { label: '用户名', value: user.username },
                    { label: '用户 ID', value: <span className="break-all">{user.id}</span> },
                    { label: '角色', value: <StatusValue value={user.role} /> },
                    { label: '用户状态', value: <StatusValue value={user.status} /> },
                    {
                      label: 'canManageAdmins 专项权限',
                      value: user.canManageAdmins ? 'true（持有）' : 'false（不持有）',
                    },
                    { label: '创建时间（UTC）', value: <UtcValue value={user.createdAt} /> },
                    { label: '更新时间（UTC）', value: <UtcValue value={user.updatedAt} /> },
                  ]}
                />
              </section>
              <Text as="p" size="sm" color="secondary">
                角色、读取权限与专项管理权限是不同维度。本页没有用户创建、状态修改、授权、删除、用户名修改或重置他人密码操作；也不根据列表推断最后管理者。
              </Text>
              <nav aria-label="用户只读关联" className="flex flex-wrap gap-4 text-sm">
                <Link
                  to="/administration/accounts"
                  search={{ ownerUserId: user.id }}
                  className="underline underline-offset-4"
                >
                  查看该用户账户
                </Link>
                <Link to="/administration/users" className="underline underline-offset-4">
                  返回用户列表
                </Link>
              </nav>
            </>
          );
        }}
      </QuerySurface>
    </ReadPage>
  );
}
