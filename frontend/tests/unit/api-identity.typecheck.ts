import {
  classifyWriteOutcome,
  type OriginalOperationIdentity,
  receiptMatchesRequest,
} from '@/services/api/errors';
import type { ApiOutcome, OperationReceipt } from '@/services/api/types';
import { ORDER_CANCEL_REQUEST } from '../msw/fixtures';

// 只由既有测试 tsconfig 编译；不导入测试运行器，也不执行这些调用。
export function verifyOriginalOperationIdentityTypes(
  outcome: ApiOutcome<unknown>,
  operation: OperationReceipt,
): void {
  const validIdentities = [
    ORDER_CANCEL_REQUEST,
    {
      ...ORDER_CANCEL_REQUEST,
      kind: 'TASK_CONTROL',
      targetType: 'TASK',
      targetId: 'task-1',
    },
    {
      ...ORDER_CANCEL_REQUEST,
      kind: 'USER_UPDATE',
      targetType: 'USER',
      targetId: 'user-1',
    },
    {
      ...ORDER_CANCEL_REQUEST,
      kind: 'ACCOUNT_RESTRICT',
      targetType: 'ACCOUNT',
      targetId: 'account-1',
    },
    {
      ...ORDER_CANCEL_REQUEST,
      kind: 'ACCOUNT_CHECK',
      targetType: 'ACCOUNT',
      targetId: 'account-1',
    },
    {
      ...ORDER_CANCEL_REQUEST,
      kind: 'ACCOUNT_SYNC',
      targetType: 'ACCOUNT',
      targetId: 'account-1',
    },
    {
      ...ORDER_CANCEL_REQUEST,
      kind: 'ACCOUNT_RECONCILE',
      targetType: 'ACCOUNT',
      targetId: 'account-1',
    },
    {
      ...ORDER_CANCEL_REQUEST,
      kind: 'PLATFORM_UPDATE',
      targetType: 'PLATFORM',
      targetId: 'platform',
    },
  ] as const satisfies readonly OriginalOperationIdentity[];

  for (const identity of validIdentities) {
    classifyWriteOutcome(outcome, identity);
    receiptMatchesRequest(operation, identity);
  }

  const onlyId = { id: ORDER_CANCEL_REQUEST.id };
  const onlyIdAndKind = { id: ORDER_CANCEL_REQUEST.id, kind: ORDER_CANCEL_REQUEST.kind };
  const withoutTargetType = {
    id: ORDER_CANCEL_REQUEST.id,
    kind: ORDER_CANCEL_REQUEST.kind,
    targetId: ORDER_CANCEL_REQUEST.targetId,
  };
  const withoutTargetId = {
    id: ORDER_CANCEL_REQUEST.id,
    kind: ORDER_CANCEL_REQUEST.kind,
    targetType: ORDER_CANCEL_REQUEST.targetType,
  };
  const wrongKind = { ...ORDER_CANCEL_REQUEST, kind: 'FUTURE_KIND' } as const;
  const wrongTargetType = { ...ORDER_CANCEL_REQUEST, targetType: 'FUTURE_TARGET' } as const;
  const wrongIdType = { ...ORDER_CANCEL_REQUEST, id: 7 } as const;
  const wrongTargetIdType = { ...ORDER_CANCEL_REQUEST, targetId: 7 } as const;
  const wrongTargetByKind = {
    order: { ...ORDER_CANCEL_REQUEST, targetType: 'ACCOUNT' },
    task: { ...ORDER_CANCEL_REQUEST, kind: 'TASK_CONTROL' },
    user: { ...ORDER_CANCEL_REQUEST, kind: 'USER_UPDATE' },
    restrict: { ...ORDER_CANCEL_REQUEST, kind: 'ACCOUNT_RESTRICT' },
    check: { ...ORDER_CANCEL_REQUEST, kind: 'ACCOUNT_CHECK' },
    sync: { ...ORDER_CANCEL_REQUEST, kind: 'ACCOUNT_SYNC' },
    reconcile: { ...ORDER_CANCEL_REQUEST, kind: 'ACCOUNT_RECONCILE' },
    platform: { ...ORDER_CANCEL_REQUEST, kind: 'PLATFORM_UPDATE' },
  } as const;
  const wrongPlatformId = {
    ...ORDER_CANCEL_REQUEST,
    kind: 'PLATFORM_UPDATE',
    targetType: 'PLATFORM',
    targetId: 'other-platform',
  } as const;
  const targetlessPlatform = { id: ORDER_CANCEL_REQUEST.id, kind: 'PLATFORM_UPDATE' } as const;

  // @ts-expect-error 省略可信原请求身份不得确认终态。
  classifyWriteOutcome(outcome);
  // @ts-expect-error 公开匹配接口同样必须传入可信原请求身份。
  receiptMatchesRequest(operation);

  // @ts-expect-error 未定义值不是完整原请求身份。
  classifyWriteOutcome(outcome, undefined);
  // @ts-expect-error 公开匹配接口不接受未定义身份。
  receiptMatchesRequest(operation, undefined);

  // @ts-expect-error 空值不是完整原请求身份。
  classifyWriteOutcome(outcome, null);
  // @ts-expect-error 公开匹配接口不接受空值身份。
  receiptMatchesRequest(operation, null);

  // @ts-expect-error 空对象缺少全部必填身份字段。
  classifyWriteOutcome(outcome, {});
  // @ts-expect-error 公开匹配接口不允许空对象通配回执。
  receiptMatchesRequest(operation, {});

  // @ts-expect-error 原始字符串不能代替完整身份。
  classifyWriteOutcome(outcome, 'original-id');
  // @ts-expect-error 公开匹配接口不接受原始字符串。
  receiptMatchesRequest(operation, 'original-id');

  // @ts-expect-error 仅有标识不能确认终态。
  classifyWriteOutcome(outcome, onlyId);
  // @ts-expect-error 公开匹配接口不允许仅按标识匹配。
  receiptMatchesRequest(operation, onlyId);

  // @ts-expect-error 仅有标识与种类仍缺少目标。
  classifyWriteOutcome(outcome, onlyIdAndKind);
  // @ts-expect-error 公开匹配接口必须同时约束目标。
  receiptMatchesRequest(operation, onlyIdAndKind);

  // @ts-expect-error 目标类型不可省略。
  classifyWriteOutcome(outcome, withoutTargetType);
  // @ts-expect-error 公开匹配接口必须提供目标类型。
  receiptMatchesRequest(operation, withoutTargetType);

  // @ts-expect-error 目标标识不可省略。
  classifyWriteOutcome(outcome, withoutTargetId);
  // @ts-expect-error 公开匹配接口必须提供目标标识。
  receiptMatchesRequest(operation, withoutTargetId);

  // @ts-expect-error 未知操作种类不属于后端契约。
  classifyWriteOutcome(outcome, wrongKind);
  // @ts-expect-error 公开匹配接口不接受未知操作种类。
  receiptMatchesRequest(operation, wrongKind);

  // @ts-expect-error 未知目标类型不属于后端契约。
  classifyWriteOutcome(outcome, wrongTargetType);
  // @ts-expect-error 公开匹配接口不接受未知目标类型。
  receiptMatchesRequest(operation, wrongTargetType);

  // @ts-expect-error 原操作标识必须是字符串。
  classifyWriteOutcome(outcome, wrongIdType);
  // @ts-expect-error 公开匹配接口不接受非字符串标识。
  receiptMatchesRequest(operation, wrongIdType);

  // @ts-expect-error 目标标识必须是字符串。
  classifyWriteOutcome(outcome, wrongTargetIdType);
  // @ts-expect-error 公开匹配接口不接受非字符串目标标识。
  receiptMatchesRequest(operation, wrongTargetIdType);

  // @ts-expect-error 撤单只允许订单目标。
  classifyWriteOutcome(outcome, wrongTargetByKind.order);
  // @ts-expect-error 公开匹配接口保留撤单目标约束。
  receiptMatchesRequest(operation, wrongTargetByKind.order);

  // @ts-expect-error 任务控制只允许任务目标。
  classifyWriteOutcome(outcome, wrongTargetByKind.task);
  // @ts-expect-error 公开匹配接口保留任务控制目标约束。
  receiptMatchesRequest(operation, wrongTargetByKind.task);

  // @ts-expect-error 用户更新只允许用户目标。
  classifyWriteOutcome(outcome, wrongTargetByKind.user);
  // @ts-expect-error 公开匹配接口保留用户更新目标约束。
  receiptMatchesRequest(operation, wrongTargetByKind.user);

  // @ts-expect-error 账户限制只允许账户目标。
  classifyWriteOutcome(outcome, wrongTargetByKind.restrict);
  // @ts-expect-error 公开匹配接口保留账户限制目标约束。
  receiptMatchesRequest(operation, wrongTargetByKind.restrict);

  // @ts-expect-error 账户检查只允许账户目标。
  classifyWriteOutcome(outcome, wrongTargetByKind.check);
  // @ts-expect-error 公开匹配接口保留账户检查目标约束。
  receiptMatchesRequest(operation, wrongTargetByKind.check);

  // @ts-expect-error 账户同步只允许账户目标。
  classifyWriteOutcome(outcome, wrongTargetByKind.sync);
  // @ts-expect-error 公开匹配接口保留账户同步目标约束。
  receiptMatchesRequest(operation, wrongTargetByKind.sync);

  // @ts-expect-error 账户核对只允许账户目标。
  classifyWriteOutcome(outcome, wrongTargetByKind.reconcile);
  // @ts-expect-error 公开匹配接口保留账户核对目标约束。
  receiptMatchesRequest(operation, wrongTargetByKind.reconcile);

  // @ts-expect-error 平台更新只允许平台目标。
  classifyWriteOutcome(outcome, wrongTargetByKind.platform);
  // @ts-expect-error 公开匹配接口保留平台目标类型约束。
  receiptMatchesRequest(operation, wrongTargetByKind.platform);

  // @ts-expect-error 平台更新的目标标识固定为 platform。
  classifyWriteOutcome(outcome, wrongPlatformId);
  // @ts-expect-error 公开匹配接口不得将其他标识视为平台。
  receiptMatchesRequest(operation, wrongPlatformId);

  // @ts-expect-error 平台更新也不能通过无目标分支绕过身份约束。
  classifyWriteOutcome(outcome, targetlessPlatform);
  // @ts-expect-error 公开匹配接口不存在无目标的平台分支。
  receiptMatchesRequest(operation, targetlessPlatform);
}
