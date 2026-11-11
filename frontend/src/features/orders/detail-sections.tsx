import { Banner, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { OrderView } from './schemas';

export function OrderIdentity({ order }: { readonly order: OrderView }) {
  return (
    <section aria-labelledby="order-identity-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="order-identity-title" size="lg" weight="semibold">
        订单身份与有效委托
      </Text>
      <DefinitionList
        items={[
          { label: '本地订单 ID（UUID）', value: order.id },
          { label: '客户订单 ID（clientOrderId）', value: order.clientOrderId },
          {
            label: '官方订单 ID（exchangeOrderId）',
            value: order.exchangeOrderId ?? '未取得；不证明尚未发送',
          },
          { label: '提交幂等键（不是 operation UUID）', value: order.idempotencyKey ?? '未记录' },
          { label: '请求指纹（不是原操作身份）', value: order.requestHash || '未记录' },
          {
            label: '账户',
            value: (
              <Link
                className="underline underline-offset-4"
                to="/accounts/$id"
                params={{ id: order.exchangeAccountId }}
              >
                {order.exchangeAccountId}
              </Link>
            ),
          },
          { label: '所有者 ID', value: order.ownerUserId },
          {
            label: '关联任务',
            value: order.taskId ? (
              <Link className="underline underline-offset-4" to="/tasks/$id" params={{ id: order.taskId }}>
                {order.taskId}
              </Link>
            ) : (
              '独立委托，无任务配置'
            ),
          },
          { label: '证券与方向', value: `${order.symbol} · ${order.side}` },
          { label: '订单模式', value: <StatusValue value={order.orderType} /> },
          {
            label: '有效限价',
            value: (
              <DecimalValue
                value={order.price}
                currency={order.priceCurrency}
                unavailableLabel={order.orderType === 'MARKET' ? '不适用：MARKET 无限价' : '未知'}
              />
            ),
          },
          {
            label: '委托股数',
            value: (
              <DecimalValue
                value={order.quantity}
                unavailableLabel={
                  order.orderType === 'MARKET' && order.side === 'BUY'
                    ? '不适用：MARKET BUY 仅按本金'
                    : '未知'
                }
              />
            ),
          },
          {
            label: '委托本金',
            value: (
              <DecimalValue
                value={order.notional}
                currency={order.quoteCurrency}
                unavailableLabel="不适用：此模式按股数"
              />
            ),
          },
          {
            label: '名义额币种（quoteCurrency）',
            value: order.quoteCurrency ?? '未知；不从 USD 价格或 USDC 资金推断',
          },
          { label: '交易时段', value: order.tradingSession ?? '不适用：MARKET 不传时段；不承诺全天成交' },
          { label: '有效期', value: order.timeInForce },
        ]}
      />
      <Text as="p" size="sm" color="secondary">
        本区是订单保存的有效委托字段。关联任务的当前 config 不是该单创建时的策略快照；市价 BUY
        不承诺股数，市价 SELL 不承诺成交价。
      </Text>
    </section>
  );
}

export function OrderExecutionEvidence({ order }: { readonly order: OrderView }) {
  return (
    <section aria-labelledby="order-evidence-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="order-evidence-title" size="lg" weight="semibold">
        成交、费用与核对证据
      </Text>
      <Banner
        status="warning"
        title="订单状态不等于证据闭环"
        description="FILLED 不表示完整现金结算、最终费用、卖出库存或预留已核实。业务事件、提交幂等键及请求指纹都不能重建某次操作回执或解除原结果未知。"
      />
      <DefinitionList
        items={[
          { label: '当前订单状态', value: <StatusValue value={order.status} /> },
          { label: '服务端原因', value: order.reason ?? '未提供' },
          { label: '确认成交股数', value: <DecimalValue value={order.filledQuantity} /> },
          {
            label: '确认成交名义额',
            value: <DecimalValue value={order.filledNotional} currency={order.quoteCurrency} />,
          },
          {
            label: '存储成交均价（非报价）',
            value: <DecimalValue value={order.averagePrice} currency={order.priceCurrency} />,
          },
          {
            label: '累计费用',
            value: (
              <DecimalValue
                value={order.fee}
                currency={order.feeCurrency}
                unavailableLabel="未知费用，不能按 0 处理"
              />
            ),
          },
          { label: '费用币种', value: order.feeCurrency ?? '未知；不从 quoteCurrency 推断' },
          {
            label: 'feeFinalized',
            value: order.feeFinalized ? 'true · 最终费用已确认' : 'false · 最终费用未确认',
          },
          {
            label: 'feePending',
            value: order.feePending ? 'true · 费用待核实' : 'false · 无此待核实标记，不替代 finalized',
          },
          {
            label: 'tradeEvidencePending',
            value: order.tradeEvidencePending
              ? 'true · 成交快照证据待对齐'
              : 'false · 无此标记，不代表现金闭环',
          },
          { label: '本地现金预留（非可用余额）', value: <DecimalValue value={order.reservedCash} /> },
          { label: '本地股数预留（非官方库存）', value: <DecimalValue value={order.reservedQuantity} /> },
          {
            label: 'reservationReleased',
            value: order.reservationReleased ? 'true · 本地预留已释放' : 'false · 本地预留未释放',
          },
          {
            label: '发送前卖出库存基线',
            value: (
              <DecimalValue value={order.sellInventoryBaseline} unavailableLabel="未记录；不构造可卖股数" />
            ),
          },
          { label: '卖出库存核实时间', value: <UtcValue value={order.sellInventoryVerifiedAt} /> },
          { label: '最近核对时间（不是一致结论）', value: <UtcValue value={order.reconciledAt} /> },
        ]}
      />
    </section>
  );
}

export function OrderTimes({ order }: { readonly order: OrderView }) {
  return (
    <section aria-labelledby="order-times-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="order-times-title" size="lg" weight="semibold">
        订单时钟
      </Text>
      <DefinitionList
        items={[
          { label: '创建时间', value: <UtcValue value={order.createdAt} /> },
          { label: '更新时间', value: <UtcValue value={order.updatedAt} /> },
          { label: '开始提交', value: <UtcValue value={order.submitStartedAt} /> },
          { label: '确认受理', value: <UtcValue value={order.submittedAt} /> },
          { label: '开始取消', value: <UtcValue value={order.cancelStartedAt} /> },
          { label: '等待截止', value: <UtcValue value={order.waitDeadlineAt} /> },
        ]}
      />
      <Text as="p" size="sm" color="secondary">
        开始提交不是受理证据；没有官方 ID
        或受理时间也不能证明从未发送。所有时间来自服务端保存字段，不使用页面加载时间补值。
      </Text>
    </section>
  );
}
