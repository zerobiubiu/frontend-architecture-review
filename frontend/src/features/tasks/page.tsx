import { Text } from '@astryxdesign/core';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { useReadSearch } from '@/lib/read-only/search';
import { TASK_COLUMNS } from './columns';
import { useTasksList } from './queries';
import { taskSearchSchema } from './schemas';

const FILTER_FIELDS: readonly FilterField[] = [
  { name: 'accountId', label: '账户 ID', placeholder: 'UUID；留空为授权范围' },
  { name: 'ownerUserId', label: '所有者 ID', placeholder: '交易员仅本人；管理员可跨所有者' },
  { name: 'symbol', label: '证券代码（精确）', placeholder: '按原串匹配，不自动转大写' },
  { name: 'status', label: '任务状态（精确）', placeholder: '如 EXPIRED、RECONCILING' },
  { name: 'search', label: '任务关键词', placeholder: '名称、证券、当前原因' },
  { name: 'from', label: '创建时间起（UTC）', placeholder: '2026-11-01T00:00:00Z' },
  { name: 'to', label: '创建时间止（UTC）', placeholder: '2026-11-30T23:59:59Z' },
];

export function TasksPage() {
  const state = useReadSearch(taskSearchSchema);
  const query = useTasksList(state.search, state.error === null);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({
    ownerUserId: false,
    nextRunAt: false,
  });
  const search = state.search;
  return (
    <ReadPage title="任务" description="只读配置、服务端进度与执行证据；不启动、暂停、恢复、停止或修改任务。">
      <FilterBar
        fields={FILTER_FIELDS}
        values={{
          accountId: search.accountId ?? '',
          ownerUserId: search.ownerUserId ?? '',
          symbol: search.symbol ?? '',
          status: search.status ?? '',
          search: search.search ?? '',
          from: search.from ?? '',
          to: search.to ?? '',
        }}
        onApply={state.apply}
        onReset={state.reset}
        isPending={query.isFetching}
      />
      <Text as="p" size="sm" color="secondary">
        关键词仅搜名称、证券与当前 reason，不搜任务 ID 或历史受阻原因；条件按 AND 生效。日期筛选
        createdAt（含边界），不是预约／执行窗口。固定 createdAt DESC、id DESC，无自选排序。
      </Text>
      <QuerySurface query={query} disabledReason={state.error ?? undefined} label="任务查询结果">
        {(data) => (
          <>
            <Text as="p" size="sm" color="secondary">
              来源：{data.source}。原计划以 config.scheduledStartAt
              原文为准；历史受阻不覆盖当前终态。金额是任务名义记录（接口未带币种），不是 Funding
              可用现金；不计算前端进度比例。
            </Text>
            <DataTableShell
              data={data.items}
              columns={TASK_COLUMNS}
              totalItems={data.total}
              page={data.page}
              pageSize={data.pageSize}
              onPageChange={state.setPage}
              onPageSizeChange={state.setPageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              getRowId={(row) => row.id}
              columnVisibility={visibility}
              onColumnVisibilityChange={setVisibility}
              emptyTitle="没有匹配当前筛选的任务"
              emptyDescription="历史受阻文字和任务 ID 不在关键词搜索列中。"
            />
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
