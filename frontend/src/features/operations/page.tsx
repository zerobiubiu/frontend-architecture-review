import { Banner, Button, Text, TextInput } from '@astryxdesign/core';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { type FormEvent, useState } from 'react';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import { uuidSchema } from '@/lib/read-only/schemas';
import { BusinessEventsSection } from './business-events';
import { useUnresolvedOperations } from './queries';
import { OperationTargetLink } from './receipt-details';
import type { OperationRead } from './schemas';

const RECEIPT_COLUMNS: ColumnDef<typeof tableFeatures, OperationRead>[] = [
  {
    id: 'id',
    header: '操作 UUID／解析状态',
    enableHiding: false,
    cell: ({ row }) =>
      row.original.kind === 'valid' ? (
        <Link to="/operations/$id" params={{ id: row.original.receipt.id }}>
          {row.original.receipt.id}
        </Link>
      ) : row.original.kind === 'invalid' ? (
        'invalid · 回执无法验证'
      ) : (
        'absent · 未提供回执'
      ),
  },
  {
    id: 'kind',
    header: '服务端种类',
    cell: ({ row }) => (row.original.kind === 'valid' ? row.original.receipt.kind : '未知'),
  },
  {
    id: 'status',
    header: '服务端报告状态',
    cell: ({ row }) => (
      <StatusValue value={row.original.kind === 'valid' ? row.original.receipt.status : null} />
    ),
  },
  {
    id: 'phase',
    header: '阶段 phase',
    cell: ({ row }) => (row.original.kind === 'valid' ? row.original.receipt.phase : '未知'),
  },
  {
    id: 'outcome',
    header: '服务端 outcome',
    cell: ({ row }) => (row.original.kind === 'valid' ? (row.original.receipt.outcome ?? '未提供') : '未知'),
  },
  {
    id: 'target',
    header: '目标对象',
    cell: ({ row }) =>
      row.original.kind === 'valid' ? (
        <OperationTargetLink receipt={row.original.receipt} />
      ) : (
        '未采用无效目标'
      ),
  },
  {
    id: 'actor',
    header: '服务端操作者 UUID',
    cell: ({ row }) => (row.original.kind === 'valid' ? row.original.receipt.actorUserId : '未知'),
  },
  {
    id: 'updatedAt',
    header: '服务端更新时间',
    cell: ({ row }) => (
      <UtcValue value={row.original.kind === 'valid' ? row.original.receipt.updatedAt : null} />
    ),
  },
  { id: 'intent', header: '本客户端原意图', cell: () => '未知（未关联独立原身份）' },
];

function OperationLookup() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = uuidSchema.safeParse(draft);
    if (!parsed.success) {
      setError('请输入有效操作 UUID；未发起读取');
      return;
    }
    setError(null);
    void navigate({ to: '/operations/$id', params: { id: parsed.data.toLowerCase() } });
  }
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-2" aria-label="按已知操作 UUID 读取">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label="已知操作 UUID" value={draft} onChange={setDraft} />
        <Button type="submit" label="读取此 UUID 的服务端回执" variant="secondary" />
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

export function OperationsPage() {
  const query = useUnresolvedOperations();
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  return (
    <ReadPage
      title="操作回执与业务事件"
      description="两类独立数据：服务端未解决扫描回执，以及真实分页的业务事件。不是完整操作历史。"
    >
      <Banner
        status="warning"
        title="服务端报告状态 ≠ 本客户端原意图结论"
        description="本阶段没有发送前独立保存的完整原身份。即使服务端报告 SUCCEEDED，也不宣告本客户端原意图 applied、不解除未知保护，不调用恢复／核对 POST。目标对象与事件只提供关联读取。"
      />
      <section aria-label="未解决扫描回执" className="flex min-w-0 flex-col gap-3">
        <Text as="h2" size="lg" weight="semibold">
          已取得的服务端回执
        </Text>
        <Text as="p" size="sm" color="secondary">
          GET /operations 不接受通用筛选、分页或排序。扫描 PROCESSING／UNKNOWN／CONFLICT
          后逐项读取，可能包含刚收敛的终态；不是完整未解决集合或终态历史。列表漏项不能证明未执行。
        </Text>
        <OperationLookup />
        <QuerySurface query={query} label="操作回执列表查询结果">
          {(data) => (
            <DataTableShell
              data={data}
              columns={RECEIPT_COLUMNS}
              pagination={false}
              title="未解决扫描返回的回执"
              columnVisibility={visibility}
              onColumnVisibilityChange={setVisibility}
              emptyTitle="此次扫描未返回可读回执"
              emptyDescription="不代表没有未知操作，也不提供已完成操作的完整历史。已知 UUID 可单独读取。"
            />
          )}
        </QuerySurface>
        <Text as="p" size="sm" color="secondary">
          没有独立 operations SSE 资源。关联对象变化只提示重读，不能保证每次回执变化都有通知；可显式重新读取。
        </Text>
      </section>
      <BusinessEventsSection />
    </ReadPage>
  );
}
