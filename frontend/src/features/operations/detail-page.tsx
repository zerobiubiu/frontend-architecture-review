import { Text } from '@astryxdesign/core';
import { Link, useParams } from '@tanstack/react-router';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { uuidSchema } from '@/lib/read-only/schemas';
import { useOperation } from './queries';
import { OperationReceiptDetails } from './receipt-details';

export function OperationDetailPage() {
  const params = useParams({ strict: false });
  const parsed = uuidSchema.safeParse(params.id);
  const id = parsed.success ? parsed.data.toLowerCase() : '';
  const query = useOperation(id, parsed.success);
  return (
    <ReadPage
      title="操作回执详情"
      description="按已知 UUID 读取服务端报告；URL 标识不构成完整原请求身份。"
      toolbar={<Link to="/operations">返回回执与业务事件</Link>}
    >
      <Text as="p" size="sm" color="secondary">
        没有原 input／action 或独立原身份存储，不能判定本客户端原意图已应用。404 或列表漏项也不能证明未执行。
      </Text>
      <QuerySurface
        query={query}
        disabledReason={parsed.success ? undefined : '操作标识必须为有效 UUID；未发起读取'}
        label="操作回执详情查询结果"
      >
        {(value) => <OperationReceiptDetails value={value} />}
      </QuerySurface>
    </ReadPage>
  );
}
