import { Banner, Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import { DefinitionList, JsonDetails } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import type { OperationRead, OperationView, PublicOperationResult } from './schemas';

export function OperationTargetLink({ receipt }: { readonly receipt: OperationView }) {
  const id = receipt.targetId;
  switch (receipt.targetType) {
    case 'ORDER':
      return (
        <Link to="/orders/$id" params={{ id }}>
          {id}
        </Link>
      );
    case 'TASK':
      return (
        <Link to="/tasks/$id" params={{ id }}>
          {id}
        </Link>
      );
    case 'ACCOUNT':
      return (
        <Link to="/accounts/$id" params={{ id }}>
          {id}
        </Link>
      );
    default:
      return <span className="break-all">{id}</span>;
  }
}

function outcomeMeaning(outcome: string | null): string {
  switch (outcome) {
    case 'CANCEL_CONFIRMED':
      return '服务端报告目标撤单已确认；不建立本客户端的原请求身份。';
    case 'TARGET_TERMINAL_OTHER':
      return '目标已为其他终态，不等于撤单成功。';
    case 'LOCAL_INTENT_ABORTED':
      return '本地意图终止，与官方撤单确认不同。';
    case 'CONTROL_APPLIED':
      return '本地控制已应用，不等于挂单已撤或任务完成。';
    case 'RECONCILIATION_COMPLETED':
      return '核对工作完成，仍须读取结果的 PARTIAL／UNAVAILABLE／DIFFERENCE 边界。';
    default:
      return '仅展示服务端 outcome 原文；不能推断原 action、输入或本客户端原意图终态。';
  }
}

function OperationResult({ result }: { readonly result: PublicOperationResult | null }) {
  if (result === null)
    return (
      <Text as="p" size="sm" color="secondary">
        服务端 result 为空，不能补造业务结果。
      </Text>
    );
  const details = result.details;
  return (
    <section aria-label="服务端结果投影" className="flex min-w-0 flex-col gap-3">
      <Text as="h3" size="base" weight="semibold">
        服务端 result（只读公开投影）
      </Text>
      <DefinitionList
        items={[
          { label: '结果内业务状态', value: <StatusValue value={result.status} /> },
          { label: '结果内连接状态', value: <StatusValue value={result.connectionStatus} /> },
          { label: '结果连接说明', value: result.connectionMessage ?? '未提供' },
          { label: '结果资产说明', value: result.assetMessage ?? '未提供' },
          { label: '结果来源', value: result.source ?? details?.source ?? '未提供' },
          {
            label: '结果资产可用性',
            value:
              (result.assetsAvailable ?? details?.assetsAvailable) === true
                ? '服务端报告可用；非完整资产'
                : (result.assetsAvailable ?? details?.assetsAvailable) === false
                  ? '服务端报告不可用'
                  : '未提供，未知',
          },
          { label: '结果核对说明', value: details?.message ?? details?.note ?? '未提供' },
          {
            label: '结果钱包错误',
            value: result.walletSyncError ?? details?.walletError ?? '未提供错误；不据此推断钱包读取成功',
          },
          { label: '结果历史错误', value: details?.historyError ?? '未提供错误；不据此推断完整历史已核实' },
        ]}
      />
      {result.price !== undefined ||
      result.quantity !== undefined ||
      result.notional !== undefined ||
      result.fee !== undefined ? (
        <DefinitionList
          items={[
            {
              label: '结果价格',
              value: <DecimalValue value={result.price} currency={result.priceCurrency} />,
            },
            { label: '结果股数', value: <DecimalValue value={result.quantity} /> },
            { label: '结果名义额（未推断币种）', value: <DecimalValue value={result.notional} /> },
            { label: '结果费用', value: <DecimalValue value={result.fee} currency={result.feeCurrency} /> },
          ]}
        />
      ) : null}
      <JsonDetails value={result} title="经过字段白名单的公开结果附加信息" />
      <Text as="p" size="sm" color="secondary">
        SUCCEEDED 可能同时保存连接
        ERROR、资产同步失败或部分核对结果，不等于业务全成功。仅保留有限公开字段，未展示的附加字段不代表不存在。result、目标对象及事件都不能反构发送前独立保存的原请求身份。
      </Text>
    </section>
  );
}

export function OperationReceiptDetails({ value }: { readonly value: OperationRead }) {
  if (value.kind === 'absent') {
    return (
      <Banner
        status="warning"
        title="GET data 未提供回执"
        description="保留 absent 状态；读取成功不等于原意图已应用，不能解除未知保护。"
      />
    );
  }
  if (value.kind === 'invalid') {
    return (
      <Banner
        status="error"
        title="回执无法验证（invalid）"
        description="未使用无效回执的状态、结果或原文，不展示 raw／秘密字段；本客户端原意图保持未知。"
      />
    );
  }
  const receipt = value.receipt;
  return (
    <section aria-label="服务端操作回执" className="flex min-w-0 flex-col gap-4">
      <Banner
        status="warning"
        title="本客户端原意图：未知（未关联）"
        description="没有发送前独立保存的完整原请求身份。UUID、同条回执、服务端 SUCCEEDED、目标当前对象或相似配置均不能用来自我匹配，也不会据此解除未知保护。"
      />
      <DefinitionList
        items={[
          { label: '操作 UUID', value: receipt.id },
          { label: '服务端操作者 UUID', value: receipt.actorUserId },
          { label: '服务端操作种类', value: receipt.kind },
          { label: '目标类型', value: receipt.targetType },
          { label: '目标对象（仅关联读取）', value: <OperationTargetLink receipt={receipt} /> },
          { label: '服务端报告状态', value: <StatusValue value={receipt.status} /> },
          { label: '服务端阶段 phase', value: receipt.phase },
          { label: '服务端 outcome', value: receipt.outcome ?? '未提供' },
          { label: 'outcome 含义', value: outcomeMeaning(receipt.outcome) },
          { label: '服务端创建时间', value: <UtcValue value={receipt.createdAt} /> },
          { label: '服务端更新时间', value: <UtcValue value={receipt.updatedAt} /> },
          { label: '服务端结束时间', value: <UtcValue value={receipt.finishedAt} /> },
          { label: '公开错误代码', value: receipt.error?.code ?? '未提供' },
          { label: '公开错误说明', value: receipt.error?.message ?? '未提供' },
        ]}
      />
      <OperationResult result={receipt.result} />
      <Text as="p" size="sm" color="secondary">
        这是 data 内的服务端回执。能读取不表示由当前用户发起；GET 可能按持久证据收敛，不重执行业务。本页不调用
        POST reconcile 或写入结果分类。
      </Text>
    </section>
  );
}
