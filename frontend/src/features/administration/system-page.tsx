import { Banner, Text } from '@astryxdesign/core';
import { DefinitionList } from '@/components/read-only/object-details';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { StatusValue, UtcValue } from '@/components/read-only/values';
import { AdministrationAccess, useAdminReadDenial } from './access';
import { useAdminHealth, useAdminSystem } from './queries';
import { HealthSection, SettingsSection } from './sections';
import { EndpointsTable, HeartbeatsTable, SystemEventsTable } from './tables';

export function SystemPage() {
  const denied = useAdminReadDenial();
  const system = useAdminSystem();
  const health = useAdminHealth();
  return (
    <ReadPage
      title="系统只读状态"
      description="已存平台设置、全部心跳、最近系统事件、静态环境能力与当前 API 进程最近测速缓存；不修改设置，也不触发测速。"
    >
      <AdministrationAccess />
      <QuerySurface query={health} disabledReason={denied} label="健康快照">
        {(read) => <HealthSection read={read} />}
      </QuerySurface>
      <QuerySurface query={system} disabledReason={denied} label="系统状态">
        {(data) => (
          <>
            <SettingsSection settings={data.settings} />
            <HeartbeatsTable heartbeats={data.heartbeats} />
            <section aria-labelledby="admin-environment-title" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="admin-environment-title" size="lg" weight="semibold">
                静态环境与实现能力
              </Text>
              <DefinitionList
                items={[
                  {
                    label: '环境 / 标签',
                    value: `${data.environment.environment} / ${data.environment.label}`,
                  },
                  { label: 'API 版本', value: data.environment.apiVersion },
                  {
                    label: '静态 availability',
                    value: <StatusValue value={data.environment.availability} />,
                  },
                  {
                    label: '静态 tradingReady 标记',
                    value: data.environment.tradingReady ? 'true（实现声明）' : 'false（实现声明）',
                  },
                  {
                    label: '买入 / 卖出实现支持',
                    value: `${data.environment.buySupported ? '支持买入' : '不支持买入'} / ${data.environment.sellSupported ? '支持卖出' : '不支持卖出'}`,
                  },
                  {
                    label: '行情能力',
                    value: data.environment.capabilities.quotes ? '已实现' : '未声明实现',
                  },
                  {
                    label: '订单 / 成交能力',
                    value: `${data.environment.capabilities.orders ? '订单已实现' : '订单未声明实现'} / ${data.environment.capabilities.trades ? '成交已实现' : '成交未声明实现'}`,
                  },
                  {
                    label: '资产能力',
                    value: data.environment.capabilities.assets ? '已实现' : '未声明实现',
                  },
                  {
                    label: '买入 / 卖出能力',
                    value: `${data.environment.capabilities.buy ? '买入已实现' : '买入未声明实现'} / ${data.environment.capabilities.sell ? '卖出已实现' : '卖出未声明实现'}`,
                  },
                  {
                    label: '静态阻断声明',
                    value: data.environment.blockers.length ? (
                      <ul className="list-inside list-disc">
                        {data.environment.blockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    ) : (
                      '静态声明未列阻断项（非当前检查结果）'
                    ),
                  },
                ]}
              />
              <Text as="p" size="sm" color="secondary">
                这些字段来自服务端固定实现能力声明，不检查全局急停、账户状态、资金、库存、连接或 Worker。即使
                tradingReady=true，也不代表当前可以交易。
              </Text>
            </section>
            <section aria-labelledby="admin-endpoints-title" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="admin-endpoints-title" size="lg" weight="semibold">
                节点测速缓存（当前 API 进程）
              </Text>
              <Text as="p" size="sm" color="secondary">
                仅当前 API 进程最近一次测速缓存；GET
                不触发测量，没有持久测速历史。当前所选节点或历史延迟不代表此刻节点可用。
              </Text>
              {data.endpoints === null ? (
                <Banner
                  status="info"
                  title="没有进程测速缓存"
                  description="服务端返回 null；不补造节点、延迟、测量时间或选择结果。"
                />
              ) : (
                <>
                  <DefinitionList
                    items={[
                      { label: '缓存选中节点', value: data.endpoints.selected ?? '该次未选出节点' },
                      { label: '缓存测量时间（UTC）', value: <UtcValue value={data.endpoints.measuredAt} /> },
                    ]}
                  />
                  <EndpointsTable endpoints={data.endpoints.results} />
                </>
              )}
            </section>
            <section aria-labelledby="admin-system-events-title" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="admin-system-events-title" size="lg" weight="semibold">
                最近系统事件
              </Text>
              <Text as="p" size="sm" color="secondary">
                最新最多 10 条系统事件，没有分页，不是服务器 JSONL 日志下载或完整告警历史。当前客户端不提供
                CLI 资产诊断报告。
              </Text>
              <SystemEventsTable events={data.events} title="本次系统事件" />
            </section>
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
