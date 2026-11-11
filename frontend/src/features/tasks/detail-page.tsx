import { Banner, Text } from '@astryxdesign/core';
import { Link, useParams } from '@tanstack/react-router';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { ORDER_COLUMNS, ORDER_INITIAL_COLUMNS } from '@/features/orders/columns';
import { BusinessEventsTable, LocalTradesTable } from '@/features/orders/evidence-tables';
import { uuidSchema } from '@/lib/read-only/schemas';
import { TaskConfigSection } from './config-section';
import { TaskProgressSection } from './progress-section';
import { useTaskDetail } from './queries';
import { TaskStateSection, TaskTimesSection } from './state-sections';

export function TaskDetailPage() {
  const { id } = useParams({ strict: false });
  const valid = uuidSchema.safeParse(id);
  const query = useTaskDetail(id);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(ORDER_INITIAL_COLUMNS);
  return (
    <ReadPage
      title="任务详情"
      description="当前公开配置、后端汇总、时间与该任务内嵌证据。"
      toolbar={
        <Link className="underline underline-offset-4" to="/tasks">
          返回任务列表
        </Link>
      }
    >
      <QuerySurface
        query={query}
        disabledReason={valid.success ? undefined : '任务 ID 必须为有效 UUID；未发起详情请求。'}
        label="任务详情查询结果"
      >
        {(data) => (
          <div className="flex min-w-0 flex-col gap-6">
            <Text as="p" size="sm" color="secondary">
              来源：{data.source}
              。全部关联订单、成交、事件来自本次详情响应，不请求虚构的配置／进度／事件子接口。
            </Text>
            <TaskStateSection task={data.task} lastInterruption={data.lastInterruption} />
            <TaskConfigSection config={data.task.config} />
            <TaskProgressSection summary={data.summary} />
            <TaskTimesSection task={data.task} />
            <section aria-labelledby="task-orders-title" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="task-orders-title" size="lg" weight="semibold">
                关联本地订单
              </Text>
              <Text as="p" size="sm" color="secondary">
                仅此任务 orders 数组，按 createdAt
                倒序，无分页；每单状态与费用／预留／库存证据独立。当前任务配置不是各单策略快照。
              </Text>
              <DataTableShell
                data={data.orders}
                columns={ORDER_COLUMNS}
                pagination={false}
                getRowId={(row) => row.id}
                columnVisibility={visibility}
                onColumnVisibilityChange={setVisibility}
                emptyTitle="该任务未返回关联本地订单"
              />
            </section>
            <LocalTradesTable trades={data.trades} />
            <BusinessEventsTable events={data.events} />
            <section aria-labelledby="task-operation-gap" className="flex flex-col gap-3">
              <Text as="h2" id="task-operation-gap" size="lg" weight="semibold">
                操作历史完整性
              </Text>
              <Banner
                status="info"
                title="没有按任务查询完整操作历史的 GET"
                description="详情业务事件不是操作回执。现有接口仅有未解决操作列表与已知 operation UUID 单查；不从当前状态、订单幂等键或 TASK_CONTROL 类型猜原 action、输入及结果。只读阶段不产生原操作恢复身份。"
              />
              <Link className="underline underline-offset-4" to="/operations">
                查看已取得的服务端操作报告
              </Link>
            </section>
          </div>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
