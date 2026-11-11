import { Banner, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { HealthRead, SettingsView, WorkerView } from './types';

export function SettingsSection({ settings }: { readonly settings: SettingsView | null }) {
  return (
    <section aria-labelledby="admin-settings-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="admin-settings-title" size="lg" weight="semibold">
        平台设置与预留政策
      </Text>
      {settings === null ? (
        <Banner
          status="warning"
          title="平台设置记录不可用"
          description="服务端返回 null；急停和额度未知，不使用默认值或零值代替。"
        />
      ) : (
        <DefinitionList
          items={[
            { label: '设置 ID / 环境', value: `${settings.id} / ${settings.environment}` },
            { label: '全局急停（存储值）', value: settings.emergencyStop ? '已开启' : '未开启' },
            {
              label: '单笔最大股数',
              value: <span className="tabular-nums">{settings.maxOrderQuantity}</span>,
            },
            {
              label: '任务最大股数',
              value: <span className="tabular-nums">{settings.maxTaskQuantity}</span>,
            },
            { label: '单笔最大名义金额', value: <DecimalValue value={settings.maxOrderNotional} /> },
            { label: '费用预留比例 feeReserveRate', value: <DecimalValue value={settings.feeReserveRate} /> },
            {
              label: '费用最低预留 feeReserveMinimum',
              value: <DecimalValue value={settings.feeReserveMinimum} />,
            },
            {
              label: '最近修改者',
              value: settings.updatedBy ? (
                <Link
                  to="/administration/users/$id"
                  params={{ id: settings.updatedBy }}
                  className="break-all underline underline-offset-4"
                >
                  {settings.updatedBy}
                </Link>
              ) : (
                '未知'
              ),
            },
            { label: '创建时间（UTC）', value: <UtcValue value={settings.createdAt} /> },
            { label: '更新时间（UTC）', value: <UtcValue value={settings.updatedAt} /> },
          ]}
        />
      )}
      <Text as="p" size="sm" color="secondary">
        费用参数仅用于保守资金 RESERVE
        预留，不是官方实际费率或已结算费用。不计算账户预算；当前契约未提供任务最大名义金额、平台最小间隔或股票白名单设置。
      </Text>
    </section>
  );
}

export function WorkerSection({ worker }: { readonly worker: WorkerView }) {
  return (
    <section aria-labelledby="admin-worker-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="admin-worker-title" size="lg" weight="semibold">
        Worker 服务端状态
      </Text>
      <DefinitionList
        items={[
          { label: '服务端在线判定', value: worker.online ? '在线（不代表运行健康）' : '未判定在线' },
          { label: '报告状态', value: <StatusValue value={worker.status} /> },
          { label: '最近心跳（UTC）', value: <UtcValue value={worker.lastSeenAt} /> },
        ]}
      />
      <Text as="p" size="sm" color="secondary">
        服务端仅按 production 的 worker: 心跳判定，窗口为 max(10 秒, workerIntervalMs × 10)。新鲜 RECOVERING /
        DEGRADED 也可 online=true，不能等同 RUNNING 或交易就绪。未取得心跳时间保留未知。
      </Text>
    </section>
  );
}

export function HealthSection({ read }: { readonly read: HealthRead }) {
  const { health, httpStatus } = read;
  return (
    <section aria-labelledby="admin-health-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="admin-health-title" size="lg" weight="semibold">
        API / 数据库健康快照
      </Text>
      {httpStatus === 503 ? (
        <Banner
          status="warning"
          title="健康检查降级（HTTP 503）"
          description="保留 /healthz 返回的降级证据；这不是业务读取成功或交易许可。"
        />
      ) : null}
      <DefinitionList
        items={[
          {
            label: '健康 HTTP / 状态',
            value: (
              <span>
                {httpStatus} / <StatusValue value={health.status} />
              </span>
            ),
          },
          { label: '数据库可连接', value: health.database.online ? '是' : '否' },
          { label: '数据库环境有效', value: health.database.environmentValid ? '是' : '否' },
          { label: '健康环境', value: health.environment },
          { label: '健康快照服务端时间（UTC）', value: <UtcValue value={health.time} /> },
        ]}
      />
      <WorkerSection worker={health.worker} />
      <Text as="p" size="sm" color="secondary">
        此快照不检查账户、资金、库存或急停。worker 通知也不能保证数据库故障即时通知；需要时显式重新读取。
      </Text>
    </section>
  );
}
