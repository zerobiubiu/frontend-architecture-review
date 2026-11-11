import { Text } from '@astryxdesign/core';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { useReadSearch } from '@/lib/read-only/search';
import { AdministrationAccess, useAdminReadDenial } from './access';
import { useAdminUsers } from './queries';
import { usersSearchSchema } from './schemas';
import { USER_COLUMNS } from './tables';

const USER_FILTERS: readonly FilterField[] = [
  { name: 'ownerUserId', label: '用户 ID（精确）', placeholder: 'users.id UUID' },
  {
    name: 'status',
    label: '用户状态',
    options: [
      { value: 'ACTIVE', label: 'ACTIVE' },
      { value: 'DISABLED', label: 'DISABLED' },
    ],
  },
  { name: 'search', label: '用户名 / 角色关键词', placeholder: '不区分大小写的包含搜索' },
  { name: 'from', label: '创建起始（UTC，含）', placeholder: '2026-11-01T00:00:00Z' },
  { name: 'to', label: '创建结束（UTC，含）', placeholder: '2026-11-30T23:59:59Z' },
];

export function UsersPage() {
  const denied = useAdminReadDenial();
  const state = useReadSearch(usersSearchSchema);
  const query = useAdminUsers(state.search, state.error === null);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  return (
    <ReadPage
      title="用户只读查询"
      description="普通 ADMIN 可读取全部用户及管理员；专项 canManageAdmins 标志仅作真实展示，不生成任何管理写入控件。"
    >
      <AdministrationAccess />
      {denied ? null : (
        <FilterBar
          fields={USER_FILTERS}
          values={{
            ownerUserId: state.search.ownerUserId ?? '',
            status: state.search.status ?? '',
            search: state.search.search ?? '',
            from: state.search.from ?? '',
            to: state.search.to ?? '',
          }}
          onApply={state.apply}
          onReset={state.reset}
          isPending={query.isFetching}
        />
      )}
      <QuerySurface query={query} disabledReason={denied ?? state.error ?? undefined} label="用户列表">
        {(data) => (
          <>
            <Text as="p" size="sm" color="secondary">
              真实服务端分页，按 createdAt / id 倒序；日期筛选是创建时间。ownerUserId 在此映射
              users.id。没有独立 role 筛选，关键词可匹配 username 或 role；不会向接口发送无效账户或证券筛选。
            </Text>
            <DataTableShell
              data={data.items}
              columns={USER_COLUMNS}
              totalItems={data.total}
              page={state.search.page}
              pageSize={state.search.pageSize}
              onPageChange={state.setPage}
              onPageSizeChange={state.setPageSize}
              columnVisibility={visibility}
              onColumnVisibilityChange={setVisibility}
              getRowId={(row) => row.id}
              title="公开用户记录"
              emptyTitle="没有匹配的用户"
              emptyDescription="请调整真实有效的筛选条件；空页不代表整个平台没有用户。"
            />
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
