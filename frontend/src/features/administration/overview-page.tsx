import { Text } from '@astryxdesign/core';
import { DefinitionList } from '@/components/read-only/object-details';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { AdministrationAccess, useAdminReadDenial } from './access';
import { useAdminOverview } from './queries';
import { SettingsSection, WorkerSection } from './sections';
import { SystemEventsTable } from './tables';

export function AdminOverviewPage() {
  const denied = useAdminReadDenial();
  const query = useAdminOverview();
  return (
    <ReadPage
      title="管理概览"
      description="平台范围的真实服务端计数、Worker 状态、已存设置与最近风险事件；不是账户资产或交易就绪证明。"
    >
      <AdministrationAccess />
      <QuerySurface query={query} disabledReason={denied} label="管理概览">
        {(data) => (
          <>
            <section aria-labelledby="admin-counts-title" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="admin-counts-title" size="lg" weight="semibold">
                平台计数（全部用户范围）
              </Text>
              <DefinitionList
                items={[
                  { label: '交易员', value: data.counts.traders },
                  { label: '管理员', value: data.counts.admins },
                  { label: '启用用户', value: data.counts.activeUsers },
                  { label: '停用用户', value: data.counts.disabledUsers },
                  { label: '账户', value: data.counts.accounts },
                  { label: '运行 / 预约 / 核对中任务', value: data.counts.runningTasks },
                  { label: '恢复待处理任务', value: data.counts.recoveryRequired },
                  { label: '全部任务', value: data.counts.totalTasks },
                  { label: '已完成任务', value: data.counts.completedTasks },
                  { label: '失败任务', value: data.counts.failedTasks },
                  { label: '过期任务', value: data.counts.expiredTasks },
                  { label: '已停止任务', value: data.counts.stoppedTasks },
                  { label: '未终结任务', value: data.counts.unfinishedTasks },
                  { label: '活动订单（含 UNKNOWN）', value: data.counts.openOrders },
                  { label: 'UNKNOWN 订单', value: data.counts.unknownOrders },
                ]}
              />
              <Text as="p" size="sm" color="secondary">
                管理员数量不是拥有专项权限的启用管理者数量；不能据此判断最后管理者。活动订单包括 PLANNED /
                SUBMITTING / ACCEPTED / PARTIALLY_FILLED / CANCELING / UNKNOWN。
              </Text>
            </section>
            <WorkerSection worker={data.worker} />
            <SettingsSection settings={data.settings} />
            <section aria-labelledby="admin-alerts-title" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="admin-alerts-title" size="lg" weight="semibold">
                最近风险系统事件
              </Text>
              <Text as="p" size="sm" color="secondary">
                仅服务端筛选的最新最多 5 条 WARN / ERROR 或指定风险状态系统事件，不是完整告警或审计历史。
              </Text>
              <SystemEventsTable events={data.recentEvents} title="已返回风险事件" />
            </section>
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
