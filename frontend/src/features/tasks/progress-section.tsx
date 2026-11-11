import { Banner, Text } from '@astryxdesign/core';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue } from '@/components/read-only/values';
import type { TaskSummaryView } from './schemas';

export function TaskProgressSection({ summary }: { readonly summary: TaskSummaryView }) {
  return (
    <section aria-labelledby="task-progress-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="task-progress-title" size="lg" weight="semibold">
        服务端进度汇总
      </Text>
      <Banner
        status="warning"
        title="剩余目标不是可新增委托预算"
        description="以下直接展示后端 summary，不由前端汇总或计算比例。remaining 为目标减已成交的非负值，未扣活动委托剩余量；不应据此追加订单。手续费不计入本金进度，接口未提供这些金额的币种字段。"
      />
      <DefinitionList
        items={[
          {
            label: '目标股数',
            value: <DecimalValue value={summary.targetQuantity} unavailableLabel="不适用：本金模式" />,
          },
          { label: '已成交股数', value: <DecimalValue value={summary.filledQuantity} /> },
          {
            label: '剩余目标股数（非预算）',
            value: <DecimalValue value={summary.remainingQuantity} unavailableLabel="不适用：本金模式" />,
          },
          {
            label: '目标本金',
            value: <DecimalValue value={summary.targetNotional} unavailableLabel="不适用：股数模式" />,
          },
          { label: '已成交名义额', value: <DecimalValue value={summary.filledNotional} /> },
          {
            label: '剩余目标本金（非预算）',
            value: <DecimalValue value={summary.remainingNotional} unavailableLabel="不适用：股数模式" />,
          },
          { label: '已有 submittedAt 的订单数', value: summary.submittedOrders },
          { label: 'FILLED 状态订单数', value: summary.filledOrders },
          { label: '部分成交订单数（可与终态重叠）', value: summary.partialOrders },
          { label: 'CANCELED 状态订单数', value: summary.canceledOrders },
          { label: 'REJECTED 状态订单数', value: summary.rejectedOrders },
        ]}
      />
      <Text as="p" size="sm" color="secondary">
        partialOrders 是有成交但未达该单目标的记录数，不限定 PARTIALLY_FILLED 状态，可同时计入 CANCELED
        等；各计数不可相加当作互斥状态分布。后端没有独立 EXPIRED
        汇总。任务完成、订单终态、操作已应用与费用／现金／库存核实必须分别理解。
      </Text>
    </section>
  );
}
