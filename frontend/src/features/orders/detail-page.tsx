import { Banner, Text } from '@astryxdesign/core';
import { Link, useParams } from '@tanstack/react-router';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { uuidSchema } from '@/lib/read-only/schemas';
import { OrderExecutionEvidence, OrderIdentity, OrderTimes } from './detail-sections';
import { BusinessEventsTable, LocalTradesTable } from './evidence-tables';
import { useOrderDetail } from './queries';

export function OrderDetailPage() {
  const { id } = useParams({ strict: false });
  const valid = uuidSchema.safeParse(id);
  const query = useOrderDetail(id);
  return (
    <ReadPage
      title="订单详情"
      description="本地订单 UUID 定位；官方订单 ID 与客户订单 ID 不能代替此路径参数。"
      toolbar={
        <Link className="underline underline-offset-4" to="/orders">
          返回订单列表
        </Link>
      }
    >
      <QuerySurface
        query={query}
        disabledReason={valid.success ? undefined : '订单 ID 必须为有效 UUID；未发起详情请求。'}
        label="订单详情查询结果"
      >
        {(data) => (
          <div className="flex min-w-0 flex-col gap-6">
            <Text as="p" size="sm" color="secondary">
              来源：{data.source}；来自单次授权订单详情，不代表完整官方账户历史。
            </Text>
            <OrderIdentity order={data.order} />
            <OrderExecutionEvidence order={data.order} />
            <OrderTimes order={data.order} />
            <LocalTradesTable trades={data.trades} />
            <BusinessEventsTable events={data.events} />
            <section aria-labelledby="order-operation-gap" className="flex flex-col gap-3">
              <Text as="h2" id="order-operation-gap" size="lg" weight="semibold">
                操作历史完整性
              </Text>
              <Banner
                status="info"
                title="没有按订单查询完整操作历史的 GET"
                description="现有接口仅有未解决操作列表与已知 operation UUID 单查；订单详情没有回执数组。提交键不是 operation UUID，不从写入类型、事件或对象当前状态推导原操作结果。"
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
