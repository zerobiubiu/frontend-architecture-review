import { Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { tableFeatures } from '@/components/ui/data-table-shell';
import { accountLinkClass } from './read-links';
import type { AccountView } from './schemas';

export function accountColumns(isAdmin: boolean): ColumnDef<typeof tableFeatures, AccountView>[] {
  return [
    {
      accessorKey: 'label',
      header: '账户 / ID',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex min-w-40 flex-col gap-1">
          <Link to="/accounts/$id" params={{ id: row.original.id }} className={accountLinkClass}>
            {row.original.label || '未命名账户'}
          </Link>
          <Text size="sm" color="secondary" className="break-all">
            {row.original.id}
          </Text>
        </div>
      ),
    },
    {
      accessorKey: 'ownerUserId',
      header: '所有者 ID',
      cell: ({ row }) =>
        isAdmin ? (
          <Link
            to="/administration/users/$id"
            params={{ id: row.original.ownerUserId }}
            className={accountLinkClass}
          >
            {row.original.ownerUserId}
          </Link>
        ) : (
          <span className="break-all">{row.original.ownerUserId}</span>
        ),
    },
    { accessorKey: 'exchange', header: '交易所' },
    {
      accessorKey: 'status',
      header: '账户状态',
      cell: ({ row }) => <StatusValue value={row.original.status} />,
    },
    {
      accessorKey: 'connectionStatus',
      header: '已存连接状态',
      cell: ({ row }) => (
        <div className="flex min-w-40 flex-col gap-1">
          <StatusValue value={row.original.connectionStatus} />
          <Text size="sm" color="secondary">
            {row.original.connectionMessage ?? '连接说明未知'}
          </Text>
        </div>
      ),
    },
    {
      id: 'credentials',
      header: '凭据 / Key 尾号',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span>{row.original.hasCredentials ? '已保存凭据' : '未保存完整凭据'}</span>
          <span>尾号：{row.original.apiKeyLast4 ?? '未知'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'availableCash',
      header: 'Funding 可用（快照）',
      cell: ({ row }) => (
        <div className="flex min-w-40 flex-col gap-1">
          <DecimalValue value={row.original.availableCash} currency={row.original.settlementCurrency} />
          <StatusValue value={row.original.source} />
        </div>
      ),
    },
    {
      accessorKey: 'cashBalance',
      header: '现金余额（未提供）',
      cell: ({ row }) => <DecimalValue value={row.original.cashBalance} />,
    },
    {
      accessorKey: 'reservedCash',
      header: '本地预留（非可执行资金）',
      cell: ({ row }) => <DecimalValue value={row.original.reservedCash} />,
    },
    {
      id: 'readiness',
      header: '服务端准备度（非资金充分性）',
      cell: ({ row }) => (
        <div className="flex min-w-44 flex-col gap-1 text-sm">
          <span>买入：{row.original.buyReady ? '是' : '否'}</span>
          <span>卖出：{row.original.sellReady ? '是' : '否'}</span>
          <span>通用：{row.original.tradingReady ? '是' : '否'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'walletSyncError',
      header: '资产来源 / 同步错误',
      cell: ({ row }) => (
        <div className="flex min-w-56 flex-col gap-1 text-sm">
          <span>{row.original.assetMessage}</span>
          <span>已存错误：{row.original.walletSyncError ?? '无已存错误（不证明当次读取成功）'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'lastSyncAt',
      header: '已存 lastSyncAt',
      cell: ({ row }) => <UtcValue value={row.original.lastSyncAt} />,
    },
    {
      id: 'snapshotReceivedAt',
      header: '钱包快照接收时间',
      cell: ({ row }) => <UtcValue value={row.original.walletSnapshot?.receivedAt} />,
    },
    {
      accessorKey: 'createdAt',
      header: '记录创建时间',
      cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
    },
    {
      accessorKey: 'updatedAt',
      header: '记录更新时间（非同步时间）',
      cell: ({ row }) => <UtcValue value={row.original.updatedAt} />,
    },
  ];
}
