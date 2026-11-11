import { Text } from '@astryxdesign/core';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { useReadSearch } from '@/lib/read-only/search';
import { AdministrationAccess, useAdminReadDenial } from './access';
import { useAdminAudit } from './queries';
import { auditSearchSchema } from './schemas';
import { AUDIT_COLUMNS } from './tables';

const AUDIT_FILTERS: readonly FilterField[] = [
  { name: 'ownerUserId', label: '发起者用户 ID（精确）', placeholder: 'ownerUserId → actorUserId' },
  { name: 'accountId', label: '目标 ID（UUID）', placeholder: 'accountId → targetId，不限定目标类型' },
  { name: 'symbol', label: '附加字段证券（精确）', placeholder: 'details.symbol 原串，不转大写' },
  { name: 'status', label: '审计结果（精确）', placeholder: 'status → result，例如 SUCCESS' },
  { name: 'search', label: '动作 / 目标类型 / 目标 ID 关键词', placeholder: '不区分大小写的包含搜索' },
  { name: 'from', label: '审计创建起始（UTC，含）', placeholder: '2026-11-01T00:00:00Z' },
  { name: 'to', label: '审计创建结束（UTC，含）', placeholder: '2026-11-30T23:59:59Z' },
];

export function AuditPage() {
  const denied = useAdminReadDenial();
  const state = useReadSearch(auditSearchSchema);
  const query = useAdminAudit(state.search, state.error === null);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  return (
    <ReadPage
      title="管理审计"
      description="平台审计的真实服务端分页；发起者、角色、目标与结果分开展示，不把审计当作运行日志或操作回执。"
    >
      <AdministrationAccess />
      {denied ? null : (
        <FilterBar
          fields={AUDIT_FILTERS}
          values={{
            ownerUserId: state.search.ownerUserId ?? '',
            accountId: state.search.accountId ?? '',
            symbol: state.search.symbol ?? '',
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
      <QuerySurface query={query} disabledReason={denied ?? state.error ?? undefined} label="管理审计">
        {(data) => (
          <>
            <Text as="p" size="sm" color="secondary">
              ownerUserId 过滤发起者 actorUserId，不是业务所有者；accountId 实际精确匹配 targetId，不附加
              targetType=ACCOUNT；status 匹配 result，不是日志 level。没有角色 / 级别过滤。全部条件 AND，按
              createdAt / id 倒序。
            </Text>
            <Text as="p" size="sm" color="secondary">
              此查询先写入服务端审计，因此当前页可能包含查询自身，重复读取可能增加总数。ADMIN_QUERY /
              ADMIN_READ / MARKET_QUOTES_QUERY 不推动审计 SSE 版本；通知不是完整审计序列或业务执行证明。
            </Text>
            <DataTableShell
              data={data.items}
              columns={AUDIT_COLUMNS}
              totalItems={data.total}
              page={state.search.page}
              pageSize={state.search.pageSize}
              onPageChange={state.setPage}
              onPageSizeChange={state.setPageSize}
              columnVisibility={visibility}
              onColumnVisibilityChange={setVisibility}
              getRowId={(row) => row.id}
              title="公开审计记录"
              emptyTitle="没有匹配的审计记录"
            />
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
