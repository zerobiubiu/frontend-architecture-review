import { Text } from '@astryxdesign/core';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, UtcValue } from '@/components/read-only/values';
import type { TaskConfigView } from './schemas';

export function TaskConfigSection({ config }: { readonly config: TaskConfigView }) {
  return (
    <section aria-labelledby="task-config-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="task-config-title" size="lg" weight="semibold">
        当前公开配置
      </Text>
      <Text as="p" size="sm" color="secondary">
        直接来自
        task.config；不是关联订单当时策略快照。只展示当前模式真实字段，未记录字段不补默认值。配置频率不保证持续执行频率。
      </Text>
      <DefinitionList
        items={[
          { label: '配置账户 ID', value: config.accountId },
          { label: '配置名称', value: config.name },
          { label: '证券／模式／方向', value: `${config.symbol} · ${config.orderType} ${config.side}` },
          {
            label: '原计划时间（权威 config.scheduledStartAt）',
            value:
              config.scheduledStartAt === undefined || config.scheduledStartAt === null ? (
                '配置未记录计划时间；不回填顶层 Date 字段'
              ) : (
                <UtcValue value={config.scheduledStartAt} />
              ),
          },
          { label: '执行窗口（秒）', value: config.executionWindowSeconds },
          { label: '执行模式', value: config.executionMode },
          { label: '配置间隔下限（秒）', value: config.globalIntervalSeconds },
          { label: '间隔模式', value: config.intervalMode },
          { label: '保存的固定间隔（秒）', value: config.fixedIntervalSeconds },
          { label: '保存的随机间隔下限（秒）', value: config.randomIntervalMin },
          { label: '保存的随机间隔上限（秒）', value: config.randomIntervalMax },
          { label: '挂单策略', value: config.autoCancelMode },
          { label: '保存的单笔超时（秒）', value: config.orderTimeoutSeconds },
          { label: '尾量／余款策略', value: config.remainderPolicy },
          { label: '订单有效期', value: config.timeInForce },
        ]}
      />
      {config.orderType === 'MARKET' && config.side === 'BUY' ? (
        <>
          <Text as="h3" size="sm" weight="semibold">
            市价买入本金配置
          </Text>
          <DefinitionList
            items={[
              { label: '目标本金', value: <DecimalValue value={config.targetNotional} /> },
              { label: '每批本金模式', value: config.notionalMode },
              { label: '保存的固定每批本金', value: <DecimalValue value={config.fixedNotional} /> },
              { label: '保存的随机本金下限', value: <DecimalValue value={config.randomNotionalMin} /> },
              { label: '保存的随机本金上限', value: <DecimalValue value={config.randomNotionalMax} /> },
            ]}
          />
          <Text as="p" size="sm" color="secondary">
            MARKET BUY 无股数目标、限价、价格规则、舍入或时段参数；仅
            DAY。手续费不计入本金目标，配置未提供币种字段，不能当作已结算现金或承诺成交股数。
          </Text>
        </>
      ) : (
        <>
          <Text as="h3" size="sm" weight="semibold">
            股数批次配置
          </Text>
          <DefinitionList
            items={[
              { label: '目标股数', value: <DecimalValue value={config.targetQuantity} /> },
              { label: '每批股数模式', value: config.quantityMode },
              { label: '保存的固定每批股数', value: <DecimalValue value={config.fixedQuantity} /> },
              { label: '保存的随机股数下限（整数）', value: config.randomQuantityMin },
              { label: '保存的随机股数上限（整数）', value: config.randomQuantityMax },
            ]}
          />
        </>
      )}
      {config.orderType === 'LIMIT' ? (
        <>
          <Text as="h3" size="sm" weight="semibold">
            限价规则
          </Text>
          <DefinitionList
            items={[
              { label: '取价规则', value: config.priceRule },
              {
                label: '保存的固定限价',
                value: (
                  <DecimalValue value={config.fixedPrice} currency="USD" unavailableLabel="未设固定价" />
                ),
              },
              { label: '报价转限价舍入', value: config.priceRounding ?? '旧配置未记录；未补写默认值' },
              { label: '交易时段', value: config.tradingSession },
            ]}
          />
        </>
      ) : config.side === 'SELL' ? (
        <Text as="p" size="sm" color="secondary">
          MARKET SELL 仅指定股数，无本金目标、限价、价格规则、舍入或时段参数；仅
          DAY，不保证成交价格或全天可成交。
        </Text>
      ) : null}
    </section>
  );
}
