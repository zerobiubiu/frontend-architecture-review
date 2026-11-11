import { Banner, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { DefinitionList, JsonDetails } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { ReconciliationRecord } from './schemas';

const MAX_VISIBLE_IDS = 100;

export function reconciliationMeaning(status: string): string {
  switch (status) {
    case 'DIFFERENCE':
      return '存在未解除的本地订单证据或未管理的官方订单；不是全量一致。';
    case 'UNAVAILABLE':
      return 'Funding 证据不可用或官方历史读取失败；不能作出一致结论。';
    case 'PARTIAL':
      return '仅已查询部分具备证据，完整官方持仓和现金结算仍未核实。';
    default:
      return '仅展示服务端状态原文；当前客户端不据此推断全量一致。';
  }
}

function DifferenceIds({ ids, local }: { readonly ids: string[] | undefined; readonly local: boolean }) {
  if (ids === undefined) return <p>记录未提供 ID 列表，保持未知。</p>;
  if (ids.length === 0) return <p>记录返回空列表；不代表完整账户一致。</p>;
  return (
    <>
      <ul className="flex min-w-0 list-inside list-disc flex-col gap-1">
        {ids.slice(0, MAX_VISIBLE_IDS).map((id) => (
          <li key={id} className="break-all">
            {local ? (
              <Link to="/orders/$id" params={{ id }}>
                {id}
              </Link>
            ) : (
              id
            )}
          </li>
        ))}
      </ul>
      {ids.length > MAX_VISIBLE_IDS ? (
        <p>
          共有 {ids.length} 个 ID，仅展示前 {MAX_VISIBLE_IDS} 个。
        </p>
      ) : null}
    </>
  );
}

export function ReconciliationRecordDetails({ record }: { readonly record: ReconciliationRecord }) {
  const details = record.details;
  const funding = details.walletSnapshot?.funding;
  return (
    <section aria-label="已加载核对记录详情" className="flex min-w-0 flex-col gap-4">
      <Text as="h2" size="lg" weight="semibold">
        已加载核对记录详情
      </Text>
      <Banner status="warning" title="没有全量一致结论" description={reconciliationMeaning(record.status)} />
      <DefinitionList
        items={[
          { label: '核对记录 UUID', value: record.id },
          { label: '服务端状态', value: <StatusValue value={record.status} /> },
          {
            label: '账户',
            value: (
              <Link to="/accounts/$id" params={{ id: record.exchangeAccountId }}>
                {record.exchangeAccountId}
              </Link>
            ),
          },
          { label: '所有者', value: record.ownerUserId },
          { label: '记录创建时间', value: <UtcValue value={record.createdAt} /> },
          { label: '业务来源', value: details.source ?? '未知' },
          { label: '钱包来源', value: details.walletSource ?? '未知' },
          {
            label: '本记录资产证据',
            value:
              details.assetsAvailable === true
                ? 'Funding 证据可用；不是完整资产'
                : details.assetsAvailable === false
                  ? '不可用；未知不补零'
                  : '记录未提供，未知',
          },
          { label: '服务端说明', value: details.message ?? '记录未提供' },
          {
            label: '历史读取错误（historyError）',
            value:
              details.historyError ??
              (details.historyError === null ? '本记录未报告错误；不代表完整历史' : '记录未提供，未知'),
          },
          {
            label: '钱包读取错误（walletError）',
            value:
              details.walletError ??
              (details.walletError === null ? '本记录未报告错误；不代表当前钱包可用' : '记录未提供，未知'),
          },
          { label: '官方成交历史总数', value: details.exchangeTradeHistoryTotal ?? '未知' },
          {
            label: '完整现金余额',
            value: <DecimalValue value={details.cashBalance} unavailableLabel="未知，未核实完整现金结算" />,
          },
          { label: '完整官方持仓', value: '未核实；本记录不提供完整官方持仓结论' },
          { label: '原历史截止时间', value: '记录未保存 historyTo，不能用创建时间替代' },
          { label: '完整性备注', value: details.note ?? '记录未提供' },
        ]}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <Text as="h3" size="base" weight="semibold">
          未解除的本地订单 UUID
        </Text>
        <DifferenceIds ids={details.unresolvedOrderIds} local />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Text as="h3" size="base" weight="semibold">
          未管理的官方订单 ID
        </Text>
        <DifferenceIds ids={details.unmanagedExchangeOrderIds} local={false} />
        <Text as="p" size="sm" color="secondary">
          官方 ID 不等于本地 UUID，不生成本地订单详情链接。
        </Text>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <Text as="h3" size="base" weight="semibold">
          记录内历史 Funding 钱包证据
        </Text>
        {funding ? (
          <DefinitionList
            items={[
              {
                label: '快照接收时间（非上游更新时间）',
                value: <UtcValue value={details.walletSnapshot?.receivedAt} />,
              },
              { label: 'Funding 接收时间', value: <UtcValue value={funding.receivedAt} /> },
              { label: '钱包／资产', value: `${funding.walletType} / ${funding.asset}` },
              { label: 'free', value: <DecimalValue value={funding.free} currency="USDC" /> },
              { label: 'locked', value: <DecimalValue value={funding.locked} currency="USDC" /> },
              { label: 'freeze', value: <DecimalValue value={funding.freeze} currency="USDC" /> },
              { label: 'withdrawing', value: <DecimalValue value={funding.withdrawing} currency="USDC" /> },
            ]}
          />
        ) : (
          <Text as="p" size="sm" color="secondary">
            本记录没有 Funding 快照，不能补零或使用当前账户数据替代。
          </Text>
        )}
        <JsonDetails
          value={{
            source: details.source,
            walletSource: details.walletSource,
            assetsAvailable: details.assetsAvailable,
            note: details.note,
          }}
          title="公开来源与完整性附加字段"
        />
      </div>
      <Text as="p" size="sm" color="secondary">
        核对遍历冻结的本地订单／任务范围；官方订单历史逐页读取，成交历史仅取第一页总数，默认起点为此前七天。没有独立核对详情接口、updatedAt
        或可恢复的完整历史窗口。
      </Text>
    </section>
  );
}
