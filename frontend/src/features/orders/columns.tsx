import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { tableFeatures } from '@/components/ui/data-table-shell';
import type { OrderView } from './schemas';

export const ORDER_COLUMNS: ColumnDef<typeof tableFeatures, OrderView>[] = [
  {
    accessorKey: 'id',
    header: '本地订单 ID',
    enableHiding: false,
    cell: ({ row }) => (
      <Link className="underline underline-offset-4" to="/orders/$id" params={{ id: row.original.id }}>
        {row.original.id}
      </Link>
    ),
  },
  { accessorKey: 'clientOrderId', header: '客户订单 ID' },
  {
    accessorKey: 'exchangeOrderId',
    header: '官方订单 ID',
    cell: ({ row }) => row.original.exchangeOrderId ?? '未取得；不代表未发送',
  },
  { accessorKey: 'symbol', header: '证券' },
  {
    id: 'intent',
    header: '委托模式',
    cell: ({ row }) => `${row.original.orderType} ${row.original.side}`,
  },
  {
    accessorKey: 'status',
    header: '订单状态',
    cell: ({ row }) => <StatusValue value={row.original.status} />,
  },
  {
    id: 'requested',
    header: '有效委托',
    cell: ({ row: { original: order } }) => (
      <div className="flex min-w-40 flex-col gap-1">
        <span>
          限价：
          <DecimalValue
            value={order.price}
            currency={order.priceCurrency}
            unavailableLabel={order.orderType === 'MARKET' ? '市价不设限价' : '未知'}
          />
        </span>
        <span>
          股数：
          <DecimalValue
            value={order.quantity}
            unavailableLabel={
              order.orderType === 'MARKET' && order.side === 'BUY' ? '按本金，不指定股数' : '未知'
            }
          />
        </span>
        <span>
          本金：
          <DecimalValue
            value={order.notional}
            currency={order.quoteCurrency}
            unavailableLabel="此模式无本金参数"
          />
        </span>
      </div>
    ),
  },
  {
    id: 'filled',
    header: '服务端成交记录',
    cell: ({ row: { original: order } }) => (
      <div className="flex min-w-36 flex-col gap-1">
        <span>
          股数：
          <DecimalValue value={order.filledQuantity} />
        </span>
        <span>
          名义额：
          <DecimalValue value={order.filledNotional} currency={order.quoteCurrency} />
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'averagePrice',
    header: '存储成交均价',
    cell: ({ row }) => (
      <DecimalValue value={row.original.averagePrice} currency={row.original.priceCurrency} />
    ),
  },
  {
    id: 'feeEvidence',
    header: '累计费用／证据',
    cell: ({ row: { original: order } }) => (
      <div className="flex min-w-36 flex-col gap-1">
        <DecimalValue
          value={order.fee}
          currency={order.feeCurrency}
          unavailableLabel="未知费用，不按零处理"
        />
        <span>{order.feeFinalized ? '最终费用已确认' : '最终费用未确认'}</span>
        <span>{order.feePending ? '有待核实费用' : '无 feePending 标记'}</span>
      </div>
    ),
  },
  {
    accessorKey: 'taskId',
    header: '关联任务',
    cell: ({ row }) =>
      row.original.taskId ? (
        <Link className="underline underline-offset-4" to="/tasks/$id" params={{ id: row.original.taskId }}>
          {row.original.taskId}
        </Link>
      ) : (
        '独立委托'
      ),
  },
  { accessorKey: 'exchangeAccountId', header: '账户 ID' },
  { accessorKey: 'ownerUserId', header: '所有者 ID' },
  {
    accessorKey: 'idempotencyKey',
    header: '提交幂等键',
    cell: ({ row }) => row.original.idempotencyKey ?? '未记录',
  },
  {
    accessorKey: 'createdAt',
    header: '创建时间（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
  },
];

export const ORDER_INITIAL_COLUMNS = { ownerUserId: false, idempotencyKey: false };
