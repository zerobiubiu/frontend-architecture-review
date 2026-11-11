import { Banner, Text } from '@astryxdesign/core';
import { useLocation } from '@tanstack/react-router';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useSession } from '@/app/runtime-context';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { hasCapability } from '@/features/auth/permissions';
import { useReadSearch } from '@/lib/read-only/search';
import { accountColumns } from './columns';
import { useAccountsList } from './queries';
import { accountSearchSchema } from './schemas';

const COMMON_FIELDS: readonly FilterField[] = [
  { name: 'accountId', label: '账户 ID', placeholder: '精确 UUID' },
  { name: 'status', label: '账户状态', placeholder: '状态原串，例如 ACTIVE' },
  { name: 'search', label: '账户标签 / Key 尾号', placeholder: '原串包含匹配，不搜索所有者姓名' },
  { name: 'from', label: '创建时间起点（UTC）', placeholder: '2026-11-01T00:00:00Z' },
  { name: 'to', label: '创建时间终点（UTC）', placeholder: '2026-11-30T23:59:59Z' },
];
const ADMIN_FIELDS: readonly FilterField[] = [
  { name: 'ownerUserId', label: '所有者 ID', placeholder: '精确 UUID；空表示全部所有者' },
  ...COMMON_FIELDS,
];

export function AccountsPage() {
  const session = useSession();
  const location = useLocation();
  const user = session.status === 'authenticated' ? session.user : null;
  const isAdmin = Boolean(user && hasCapability(user, 'administration'));
  const adminPath = location.pathname === '/administration/accounts';
  const state = useReadSearch(accountSearchSchema);
  const denied = adminPath && !isAdmin;
  const query = useAccountsList(state.search, state.error === null && !denied);
  const columns = useMemo(() => accountColumns(isAdmin), [isAdmin]);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({
    exchange: false,
    cashBalance: false,
    readiness: false,
    walletSyncError: false,
    snapshotReceivedAt: false,
    createdAt: false,
    updatedAt: false,
  });
  const disabledReason = state.error ?? (denied ? '当前身份没有系统管理读取权限。' : undefined);

  return (
    <ReadPage
      title={isAdmin ? '账户总览（跨所有者）' : '我的账户'}
      description="只读账户安全投影；不会发起连接检查、资金同步、核对或配置变更。GET 重读不刷新官方资产，管理员读取可能写审计。"
    >
      <FilterBar
        fields={isAdmin ? ADMIN_FIELDS : COMMON_FIELDS}
        values={{
          ownerUserId: state.search.ownerUserId ?? '',
          accountId: state.search.accountId ?? '',
          status: state.search.status ?? '',
          search: state.search.search ?? '',
          from: state.search.from ?? '',
          to: state.search.to ?? '',
        }}
        onApply={state.apply}
        onReset={state.reset}
        isPending={query.isFetching}
      />
      <Banner
        status="info"
        title="快照不是可执行资金或证券库存"
        description="Funding 可用是已识别的 USDC free；现金余额未知。USD 报价与 USDC 结算不同。本地预留不得再次相加或相减来推算下单预算；准备度不证明资金充分或任何证券可卖。"
      />
      <QuerySurface query={query} disabledReason={disabledReason} label="账户读取结果">
        {(data) => (
          <>
            <Text as="p" size="sm" color="secondary">
              {data.kind === 'paged'
                ? 'ADMIN 使用 /admin/accounts 的真实服务端分页；按创建时间、账户 ID 倒序。'
                : 'TRADER 使用 /accounts 返回完整匹配数组；页码和页长不参与读取，也不显示伪分页。按创建时间倒序。'}{' '}
              筛选时间针对记录 createdAt，状态精确匹配；标签 / Key
              尾号为包含匹配。不提供自定义排序或证券筛选。
            </Text>
            {data.kind === 'paged' ? (
              <DataTableShell
                title="账户"
                data={data.items}
                columns={columns}
                columnVisibility={visibility}
                onColumnVisibilityChange={setVisibility}
                totalItems={data.total}
                page={data.page}
                pageSize={data.pageSize}
                onPageChange={state.setPage}
                onPageSizeChange={state.setPageSize}
                isLoading={query.isFetching}
                getRowId={(account) => account.id}
                emptyTitle="当前筛选未返回账户"
                emptyDescription="请检查账户 ID、所有者、状态及创建时间；空结果不是资产为零的证明。"
              />
            ) : (
              <DataTableShell
                title="账户"
                data={data.items}
                columns={columns}
                columnVisibility={visibility}
                onColumnVisibilityChange={setVisibility}
                pagination={false}
                getRowId={(account) => account.id}
                emptyTitle="当前筛选未返回账户"
                emptyDescription="交易员只读取本人账户；空结果不是资产为零的证明。"
              />
            )}
            <Text as="p" size="sm" color="secondary">
              账户 API 不提供所有者姓名、独立余额或连接诊断 GET、上游资产更新时间、快照 stale 标志或新鲜度
              TTL。 记录 updatedAt 不代表成功同步；请进入账户详情核对保存的来源、错误和原始时间。
            </Text>
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
