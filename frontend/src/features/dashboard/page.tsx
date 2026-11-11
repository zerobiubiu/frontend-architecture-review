import { Banner, Card, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { useSession } from '@/app/runtime-context';
import { DefinitionList } from '@/components/read-only/object-details';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import { useAccountsList } from '@/features/accounts/queries';
import { accountSearchSchema } from '@/features/accounts/schemas';
import { useOverview } from './queries';
import type { IssueView, RecentOrderView } from './schemas';

const accountDefaults = accountSearchSchema.parse({});
const orderColumns: ColumnDef<typeof tableFeatures, RecentOrderView>[] = [
  {
    accessorKey: 'id',
    header: '本地订单',
    cell: ({ row }) => (
      <Link to="/orders/$id" params={{ id: row.original.id }}>
        {row.original.id}
      </Link>
    ),
  },
  { accessorKey: 'symbol', header: '证券' },
  { accessorKey: 'side', header: '方向' },
  { accessorKey: 'orderType', header: '委托类型' },
  {
    accessorKey: 'status',
    header: '订单状态',
    cell: ({ row }) => <StatusValue value={row.original.status} />,
  },
  {
    accessorKey: 'filledQuantity',
    header: '已成交股数',
    cell: ({ row }) => <DecimalValue value={row.original.filledQuantity} />,
  },
  {
    accessorKey: 'feeFinalized',
    header: '最终费用',
    cell: ({ row }) => (row.original.feeFinalized ? '已确认' : '尚未确认'),
  },
  {
    accessorKey: 'reservationReleased',
    header: '本地预留',
    cell: ({ row }) => (row.original.reservationReleased ? '已释放' : '保留/待核对'),
  },
  {
    accessorKey: 'updatedAt',
    header: '记录更新时间',
    cell: ({ row }) => <UtcValue value={row.original.updatedAt} />,
  },
];
const issueColumns: ColumnDef<typeof tableFeatures, IssueView>[] = [
  {
    accessorKey: 'name',
    header: '任务',
    cell: ({ row }) => (
      <Link to="/tasks/$id" params={{ id: row.original.id }}>
        {row.original.name}
      </Link>
    ),
  },
  { accessorKey: 'symbol', header: '证券' },
  {
    accessorKey: 'status',
    header: '当前状态',
    cell: ({ row }) => <StatusValue value={row.original.status} />,
  },
  { accessorKey: 'reason', header: '当前原因', cell: ({ row }) => row.original.reason ?? '未提供' },
  { accessorKey: 'stopReason', header: '停止原因', cell: ({ row }) => row.original.stopReason ?? '未提供' },
  {
    accessorKey: 'updatedAt',
    header: '任务更新时间',
    cell: ({ row }) => <UtcValue value={row.original.updatedAt} />,
  },
];

export function DashboardPage() {
  const snapshot = useSession();
  const overview = useOverview();
  const accounts = useAccountsList(accountDefaults);
  const [orderVisibility, setOrderVisibility] = useState<ColumnVisibilityState>({});
  const [issueVisibility, setIssueVisibility] = useState<ColumnVisibilityState>({});
  const user = snapshot.user;
  if (!user) return null;
  return (
    <ReadPage
      title="工作台"
      description="只读业务总览；统计固定为当前角色可查看范围，不受其它页面所选账户影响。"
    >
      <Card padding={4}>
        <section aria-label="已确认身份">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-secondary">当前用户</dt>
              <dd className="font-semibold" data-testid="identity-name">
                {user.username}
              </dd>
            </div>
            <div>
              <dt className="text-secondary">角色</dt>
              <dd>{user.role === 'ADMIN' ? '平台管理员（业务只读）' : '交易员（本阶段只读）'}</dd>
            </div>
            <div>
              <dt className="text-secondary">账户可见范围</dt>
              <dd>{user.role === 'ADMIN' ? '平台授权账户，不代表交易执行权限' : '仅本人账户与业务记录'}</dd>
            </div>
            <div>
              <dt className="text-secondary">管理员专项能力</dt>
              <dd>
                {user.role === 'ADMIN' && user.canManageAdmins
                  ? '服务端已授予（本阶段不提供写入口）'
                  : '无此专项能力'}
              </dd>
            </div>
            <div>
              <dt className="text-secondary">平台用户 ID</dt>
              <dd className="break-all font-mono">{user.id}</dd>
            </div>
          </dl>
        </section>
      </Card>
      <QuerySurface query={accounts} label="可查看账户范围">
        {(data) => (
          <Text as="p" size="sm">
            {data.kind === 'paged'
              ? `后端范围内共 ${data.total} 个账户（当前分页加载）`
              : `账户接口本次完整返回 ${data.items.length} 条`}
            。<Link to="/accounts">查看账户列表</Link>
          </Text>
        )}
      </QuerySurface>
      <QuerySurface query={overview} label="角色范围业务概览">
        {(data) => (
          <>
            <DefinitionList
              items={[
                { label: '运行/预约/核对中任务', value: data.counts.runningTasks },
                { label: '活动及未知本地订单', value: data.counts.openOrders },
                { label: '本地正股数名义持仓记录', value: data.counts.positions },
                { label: '需要人工恢复的任务', value: data.counts.recoveryRequired },
              ]}
            />
            <Banner
              status="info"
              title="范围与来源"
              description="以上为后端 LOCAL_LEDGER 角色范围统计，活动订单包含 UNKNOWN 等状态；不是账户资金、完整官方持仓或盈利统计。"
            />
            <section aria-label="默认概览账户" className="border-border border-y py-4">
              <Text as="h2" weight="semibold">
                后端默认概览账户
              </Text>
              {data.account ? (
                <DefinitionList
                  items={[
                    {
                      label: '账户',
                      value: (
                        <Link to="/accounts/$id" params={{ id: data.account.id }}>
                          {data.account.label}
                        </Link>
                      ),
                    },
                    { label: '连接状态', value: <StatusValue value={data.account.connectionStatus} /> },
                    {
                      label: 'Funding 可用资金',
                      value: (
                        <DecimalValue
                          value={
                            data.account.assetsAvailable && data.account.source === 'BINANCE_WALLET'
                              ? data.account.availableCash
                              : null
                          }
                          currency="USDC"
                        />
                      ),
                    },
                    {
                      label: '本地预留（非官方冻结）',
                      value: <DecimalValue value={data.account.reservedCash} currency="USDC" />,
                    },
                    { label: '余额来源', value: data.account.source },
                    { label: '钱包最后同步时间', value: <UtcValue value={data.account.lastSyncAt} /> },
                    {
                      label: '钱包读取情况',
                      value: data.account.walletSyncError ?? data.account.assetMessage,
                    },
                  ]}
                />
              ) : (
                <Text as="p" size="sm">
                  后端未返回默认概览账户；不生成空账户或零余额。
                </Text>
              )}
            </section>
            <section aria-label="当日本地成交名义统计">
              <Text as="h2" weight="semibold">
                UTC 当日本系统成交名义额
              </Text>
              <DefinitionList
                items={[
                  { label: '买入股数', value: <DecimalValue value={data.today.buyQuantity} /> },
                  { label: '卖出股数', value: <DecimalValue value={data.today.sellQuantity} /> },
                  {
                    label: '买入名义额',
                    value: <DecimalValue value={data.today.buyAmount} currency={data.today.quoteCurrency} />,
                  },
                  {
                    label: '卖出名义额',
                    value: <DecimalValue value={data.today.sellAmount} currency={data.today.quoteCurrency} />,
                  },
                  { label: '账户总资产 / 全账户盈亏', value: '不可用：后端没有提供权威聚合' },
                  { label: '来源', value: `${data.today.source}；现金流未核实` },
                ]}
              />
              <Text as="p" size="sm" color="secondary">
                名义额不包含完整费用或 USDC 资金闭环，不是已实现盈亏；本页面不自行加总金额。
              </Text>
            </section>
            <DataTableShell
              data={data.recentOrders}
              columns={orderColumns}
              pagination={false}
              title="最近本地订单（最多 10 条，非完整列表）"
              getRowId={(row) => row.id}
              columnVisibility={orderVisibility}
              onColumnVisibilityChange={setOrderVisibility}
            />
            <DataTableShell
              data={data.issues}
              columns={issueColumns}
              pagination={false}
              title="需要关注的任务（最多 20 条）"
              getRowId={(row) => row.id}
              columnVisibility={issueVisibility}
              onColumnVisibilityChange={setIssueVisibility}
              emptyTitle="当前范围没有返回需关注任务"
            />
            <section aria-label="服务端基础信息" className="border-border border-t pt-4">
              <DefinitionList
                items={[
                  {
                    label: 'Worker 心跳',
                    value: `${data.worker.online ? '存在新鲜心跳' : '离线或未知'} / ${data.worker.status}`,
                  },
                  { label: 'Worker 最近心跳', value: <UtcValue value={data.worker.lastSeenAt} /> },
                  {
                    label: '服务端实现环境 / 版本',
                    value: `${data.environment.label} / ${data.environment.apiVersion}`,
                  },
                ]}
              />
              <Text as="p" size="sm" color="secondary">
                RECOVERING/DEGRADED
                可有心跳但不等于健康；静态环境能力不是本次资金或交易许可。各数据成功读取时间由上方独立标明。
              </Text>
            </section>
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
