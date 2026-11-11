import { Banner, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { TaskInterruptionView, TaskView } from './schemas';

export function TaskStateSection({
  task,
  lastInterruption,
}: {
  readonly task: TaskView;
  readonly lastInterruption: TaskInterruptionView | null;
}) {
  return (
    <section aria-labelledby="task-state-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="task-state-title" size="lg" weight="semibold">
        当前任务与历史受阻
      </Text>
      <DefinitionList
        items={[
          { label: '任务 ID', value: task.id },
          { label: '名称', value: task.name },
          {
            label: '账户',
            value: (
              <Link
                className="underline underline-offset-4"
                to="/accounts/$id"
                params={{ id: task.exchangeAccountId }}
              >
                {task.exchangeAccountId}
              </Link>
            ),
          },
          { label: '所有者 ID', value: task.ownerUserId },
          { label: '证券／模式／方向', value: `${task.symbol} · ${task.orderType} ${task.side}` },
          { label: '当前任务状态', value: <StatusValue value={task.status} /> },
          { label: '当前 reason', value: task.reason ?? '未提供' },
          { label: '当前 stopReason', value: task.stopReason ?? '未提供' },
          { label: '本地现金预留（非可用资金）', value: <DecimalValue value={task.reservedCash} /> },
          { label: '本地股数预留（非官方库存）', value: <DecimalValue value={task.reservedQuantity} /> },
        ]}
      />
      {lastInterruption ? (
        <>
          <Banner
            status="info"
            title="以下仅为服务端历史受阻投影"
            description="lastInterruption 位于详情顶层，不是 task 当前状态。EXPIRED／STOPPED 等当前终态优先；旧 PAUSED／RECONCILING 原因不表示任务仍可继续，也不延长原执行窗口。"
          />
          <DefinitionList
            items={[
              { label: '历史受阻状态', value: <StatusValue value={lastInterruption.status} /> },
              { label: '历史受阻原因', value: lastInterruption.reason },
              { label: '历史 stopReason', value: lastInterruption.stopReason ?? '未提供' },
              { label: '历史事件 ID', value: lastInterruption.eventId },
              { label: '历史发生时间', value: <UtcValue value={lastInterruption.occurredAt} /> },
            ]}
          />
        </>
      ) : (
        <Text as="p" size="sm" color="secondary">
          本次详情未提供 lastInterruption；不据此推断从未受阻，也不从事件任意反推当前状态。
        </Text>
      )}
    </section>
  );
}

export function TaskTimesSection({ task }: { readonly task: TaskView }) {
  return (
    <section aria-labelledby="task-times-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="task-times-title" size="lg" weight="semibold">
        服务端执行时钟与租约
      </Text>
      <DefinitionList
        items={[
          {
            label: '顶层 scheduledStartAt（ORM Date 辅助值）',
            value: <UtcValue value={task.scheduledStartAt} />,
          },
          { label: '实际开始', value: <UtcValue value={task.startedAt} /> },
          { label: '窗口截止', value: <UtcValue value={task.deadlineAt} /> },
          { label: '任务结束', value: <UtcValue value={task.endedAt} /> },
          { label: '最近成交', value: <UtcValue value={task.lastFilledAt} /> },
          { label: '下次运行', value: <UtcValue value={task.nextRunAt} /> },
          { label: '服务端租约持有者', value: task.leaseOwner ?? '未记录' },
          { label: '服务端租约截止', value: <UtcValue value={task.leaseUntil} /> },
          { label: '创建时间', value: <UtcValue value={task.createdAt} /> },
          { label: '更新时间', value: <UtcValue value={task.updatedAt} /> },
        ]}
      />
      <Text as="p" size="sm" color="secondary">
        原计划时间只认当前配置区的 config.scheduledStartAt 原 UTC 文本，历史九位小数原样保留。顶层 Date
        值可能仅毫秒，不能补回或替代原文。开始／截止／下次运行各有不同语义；租约是服务端执行证据，不是用户锁或客户端可释放权限。
      </Text>
    </section>
  );
}
