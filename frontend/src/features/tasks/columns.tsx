import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { tableFeatures } from '@/components/ui/data-table-shell';
import type { TaskListView } from './schemas';

export const TASK_COLUMNS: ColumnDef<typeof tableFeatures, TaskListView>[] = [
  {
    accessorKey: 'name',
    header: '任务',
    enableHiding: false,
    cell: ({ row }) => (
      <Link className="underline underline-offset-4" to="/tasks/$id" params={{ id: row.original.id }}>
        {row.original.name}
      </Link>
    ),
  },
  { accessorKey: 'id', header: '任务 ID' },
  { accessorKey: 'symbol', header: '证券' },
  { id: 'intent', header: '模式／方向', cell: ({ row }) => `${row.original.orderType} ${row.original.side}` },
  {
    accessorKey: 'status',
    header: '当前状态',
    cell: ({ row }) => <StatusValue value={row.original.status} />,
  },
  {
    id: 'target',
    header: '服务端目标',
    cell: ({ row: { original: task } }) => (
      <div className="flex min-w-36 flex-col gap-1">
        <span>
          股数：
          <DecimalValue value={task.targetQuantity} unavailableLabel="不适用：按本金" />
        </span>
        <span>
          本金：
          <DecimalValue value={task.targetNotional} unavailableLabel="不适用：按股数" />
        </span>
      </div>
    ),
  },
  {
    id: 'filled',
    header: '服务端已成交',
    cell: ({ row: { original: task } }) => (
      <div className="flex min-w-36 flex-col gap-1">
        <span>
          股数：
          <DecimalValue value={task.filledQuantity} />
        </span>
        <span>
          名义额：
          <DecimalValue value={task.filledNotional} />
        </span>
      </div>
    ),
  },
  {
    id: 'scheduledRaw',
    header: '原计划时间（config UTC）',
    cell: ({ row }) =>
      row.original.config.scheduledStartAt === null || row.original.config.scheduledStartAt === undefined ? (
        '配置未记录计划时间；不以顶层字段补写'
      ) : (
        <UtcValue value={row.original.config.scheduledStartAt} />
      ),
  },
  { accessorKey: 'reason', header: '当前原因', cell: ({ row }) => row.original.reason ?? '未提供' },
  {
    id: 'lastInterruption',
    header: '历史受阻（非当前状态）',
    cell: ({ row }) =>
      row.original.lastInterruption ? (
        <div className="flex min-w-52 flex-col gap-1">
          <StatusValue value={row.original.lastInterruption.status} />
          <span>{row.original.lastInterruption.reason}</span>
          <UtcValue value={row.original.lastInterruption.occurredAt} />
        </div>
      ) : (
        '未提供历史受阻投影'
      ),
  },
  { accessorKey: 'exchangeAccountId', header: '账户 ID' },
  { accessorKey: 'ownerUserId', header: '所有者 ID' },
  {
    accessorKey: 'nextRunAt',
    header: '下次运行时间',
    cell: ({ row }) => <UtcValue value={row.original.nextRunAt} />,
  },
  {
    accessorKey: 'createdAt',
    header: '创建时间（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
  },
];
