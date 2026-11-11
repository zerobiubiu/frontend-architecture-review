import { InternationalizationProvider, LayerProvider } from '@astryxdesign/core';
import zhCN from '@astryxdesign/core/locales/zh-CN.json';
import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppServices } from '@/app/runtime';
import { AppServicesContext } from '@/app/runtime-context';
import { FilterBar, type FilterField } from '@/components/read-only/filters';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import { ApiOutcomeError } from '@/services/api/errors';

interface Row {
  id: string;
  quantity: string;
}

const ROWS: Row[] = Array.from({ length: 12 }, (_, index) => ({
  id: `ROW-${String(index + 1).padStart(3, '0')}`,
  quantity: `${index + 1}.000`,
}));
const COLUMNS: ColumnDef<typeof tableFeatures, Row>[] = [
  { accessorKey: 'id', header: '记录号' },
  { accessorKey: 'quantity', header: '数量' },
];
const QUERY_KEY = ['readonly-ui', 'rows'] as const;
const SUCCESS_TIME = Date.UTC(2026, 10, 11, 1, 2, 3, 456);
const clients = new Set<QueryClient>();

function createClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false },
    },
  });
  clients.add(client);
  return client;
}

function renderUi(ui: ReactElement, client = createClient()) {
  // 只构造真实服务实例，不启动认证、SSE 或任何后端读取。
  const services = createAppServices({ queryClient: client });
  return render(ui, {
    wrapper: ({ children }) => (
      <InternationalizationProvider locale="zh-CN" messages={{ 'zh-CN': zhCN }}>
        <LayerProvider>
          <QueryClientProvider client={client}>
            <AppServicesContext value={services}>{children}</AppServicesContext>
          </QueryClientProvider>
        </LayerProvider>
      </InternationalizationProvider>
    ),
  });
}

function httpFailure(status: number): ApiOutcomeError {
  return new ApiOutcomeError({
    kind: 'http-error',
    status,
    error: { code: 'READ_FAILED', message: `读取失败（${status}）`, requestId: null },
    receipt: { kind: 'absent' },
    sessionEpoch: 1,
  });
}

function RowsSurface({
  read,
  enabled = true,
  disabledReason,
}: {
  readonly read: () => Promise<Row[]>;
  readonly enabled?: boolean;
  readonly disabledReason?: string;
}) {
  const query = useQuery<Row[], Error>({
    queryKey: QUERY_KEY,
    queryFn: read,
    enabled,
    staleTime: 0,
  });
  return (
    <QuerySurface query={query} disabledReason={disabledReason} label="只读记录">
      {(rows) => <DataTableShell data={rows} columns={COLUMNS} pagination={false} />}
    </QuerySurface>
  );
}

const FILTER_FIELDS: readonly FilterField[] = [
  { name: 'symbol', label: '证券代码', placeholder: '输入证券代码' },
  {
    name: 'side',
    label: '方向',
    options: [
      { value: 'BUY', label: '买入' },
      { value: 'SELL', label: '卖出' },
    ],
  },
];

function FiltersHarness() {
  const [applied, setApplied] = useState<Record<string, string>>({ symbol: '', side: '' });
  return (
    <>
      <FilterBar
        fields={FILTER_FIELDS}
        values={applied}
        onApply={(next) => {
          if (next.symbol === 'INVALID') return '证券筛选不合法';
          setApplied(next);
          return null;
        }}
        onReset={() => setApplied({ symbol: '', side: '' })}
      />
      <output aria-label="已应用筛选">{new URLSearchParams(applied).toString()}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.clear();
  onlineManager.setOnline(true);
});

describe('只读页面与完整列表', () => {
  it('无分页接口完整展示已返回行，不出现虚假页码或排序操作', () => {
    renderUi(<DataTableShell data={ROWS} columns={COLUMNS} pagination={false} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(ROWS.length + 1);
    expect(within(table).getByRole('cell', { name: 'ROW-012' })).toBeVisible();
    expect(screen.getByText('已返回 12 条')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '记录号' })).not.toHaveAttribute('aria-sort');
  });
});

describe('REST 查询可见边界', () => {
  it('重新读取失败后保留陈旧数据和真实成功缓存时间，不把断开的通知当成实时', async () => {
    const client = createClient();
    client.setQueryData(QUERY_KEY, ROWS, { updatedAt: SUCCESS_TIME });
    renderUi(
      <RowsSurface
        read={async () => {
          throw new Error('读取连接中断');
        }}
      />,
      client,
    );
    expect(screen.getByRole('cell', { name: 'ROW-012' })).toBeVisible();
    expect(screen.getByText(/正在重新读取/)).toBeVisible();
    expect(screen.getByText(/非实时/)).toBeVisible();

    expect(await screen.findByText('读取连接中断')).toBeVisible();
    expect(screen.getByRole('cell', { name: 'ROW-012' })).toBeVisible();
    expect(screen.getByText(/数据可能已过期/)).toBeVisible();
    expect(screen.getByText(/01:02:03\.456 UTC/)).toHaveAttribute('datetime', '2026-11-11T01:02:03.456Z');
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();
  });

  it('服务端暂时 5xx 失败不抹掉最后成功结果', async () => {
    const client = createClient();
    client.setQueryData(QUERY_KEY, ROWS, { updatedAt: SUCCESS_TIME });
    renderUi(
      <RowsSurface
        read={async () => {
          throw httpFailure(503);
        }}
      />,
      client,
    );
    expect(await screen.findByText('读取失败（503）')).toBeVisible();
    expect(screen.getByRole('cell', { name: 'ROW-012' })).toBeVisible();
    expect(screen.getByText(/01:02:03\.456 UTC/)).toBeVisible();
  });

  it.each([401, 403, 404])('已有缓存但本次读取返回 %i 时立即隐藏原结果', async (status) => {
    const client = createClient();
    client.setQueryData(QUERY_KEY, ROWS, { updatedAt: SUCCESS_TIME });
    renderUi(
      <RowsSurface
        read={async () => {
          throw httpFailure(status);
        }}
      />,
      client,
    );
    expect(screen.getByRole('cell', { name: 'ROW-012' })).toBeVisible();
    expect(await screen.findByText(`读取失败（${status}）`)).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('ROW-012')).not.toBeInTheDocument();
    expect(screen.queryByText(/01:02:03\.456 UTC/)).not.toBeInTheDocument();
  });

  it('待选择或禁止读取的范围不会展示相同查询键的旧缓存', () => {
    const client = createClient();
    client.setQueryData(QUERY_KEY, ROWS, { updatedAt: SUCCESS_TIME });
    const read = async () => ROWS;
    const view = renderUi(<RowsSurface read={read} enabled={false} />, client);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    view.rerender(<RowsSurface read={read} enabled={false} disabledReason="请先选择账户" />);
    expect(screen.getByText('请先选择账户')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('ROW-012')).not.toBeInTheDocument();
    expect(screen.queryByText(/最后成功 REST 缓存时间/)).not.toBeInTheDocument();
  });

  it('无成功时间的缓存明确表达未知，不伪造 1970 年', () => {
    const client = createClient();
    client.setQueryData(QUERY_KEY, ROWS, { updatedAt: 0 });
    renderUi(<RowsSurface read={async () => ROWS} />, client);
    expect(screen.getByRole('cell', { name: 'ROW-012' })).toBeVisible();
    expect(screen.getByText(/最后成功 REST 缓存时间（客户端）：未知/)).toBeVisible();
    expect(screen.getByRole('region', { name: '只读记录' })).not.toHaveTextContent('1970');
  });

  it('首次读取尚未完成时展示等待状态而非空列表', async () => {
    renderUi(<RowsSurface read={async () => ROWS} />);
    expect(screen.getByRole('status', { name: '正在读取数据' })).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('离线暂停与首次读取失败都不冒充成功的空结果', async () => {
    onlineManager.setOnline(false);
    const view = renderUi(<RowsSurface read={async () => ROWS} />);
    expect(screen.getByText('查询已暂停')).toBeVisible();
    expect(screen.queryByRole('status', { name: '正在读取数据' })).not.toBeInTheDocument();
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();
    view.unmount();
    onlineManager.setOnline(true);

    renderUi(
      <RowsSurface
        read={async () => {
          throw new Error('首次读取失败');
        }}
      />,
    );
    expect(await screen.findByText('首次读取失败')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();
  });
});

describe('筛选草稿与已应用值', () => {
  it('无关刷新、新对象和字段顺序变化保留草稿，已应用值真正变化才重置', async () => {
    const user = userEvent.setup();
    const view = renderUi(
      <FilterBar
        fields={FILTER_FIELDS}
        values={{ symbol: 'OLD', side: '' }}
        onApply={() => null}
        onReset={() => undefined}
      />,
    );
    const symbol = screen.getByRole('textbox', { name: '证券代码' });
    await user.clear(symbol);
    await user.type(symbol, 'AAPL');
    view.rerender(
      <FilterBar
        fields={FILTER_FIELDS.map((field) => ({ ...field }))}
        values={{ side: '', symbol: 'OLD' }}
        onApply={() => null}
        onReset={() => undefined}
        isPending
      />,
    );
    expect(screen.getByRole('textbox', { name: '证券代码' })).toHaveValue('AAPL');
    view.rerender(
      <FilterBar
        fields={FILTER_FIELDS}
        values={{ symbol: 'MSFT', side: '' }}
        onApply={() => null}
        onReset={() => undefined}
      />,
    );
    expect(screen.getByRole('textbox', { name: '证券代码' })).toHaveValue('MSFT');
  });

  it('输入和 Astryx 选择器仅修改草稿，查询才应用，重置回到默认值', async () => {
    const user = userEvent.setup();
    renderUi(<FiltersHarness />);
    await user.type(screen.getByRole('textbox', { name: '证券代码' }), 'AAPL');
    await user.click(screen.getByRole('combobox', { name: '方向' }));
    await user.click(await screen.findByRole('option', { name: '卖出' }));
    expect(screen.getByLabelText('已应用筛选')).toHaveTextContent('symbol=&side=');
    expect(screen.getByRole('combobox', { name: '方向' })).toHaveTextContent('卖出');
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(screen.getByLabelText('已应用筛选')).toHaveTextContent('symbol=AAPL&side=SELL');
    await user.click(screen.getByRole('button', { name: '重置' }));
    expect(screen.getByRole('textbox', { name: '证券代码' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: '方向' })).not.toHaveTextContent('卖出');
    expect(screen.getByLabelText('已应用筛选')).toHaveTextContent('symbol=&side=');
  });

  it('应用失败显示错误且保留草稿，默认值未变化时显式重置仍可清空', async () => {
    const user = userEvent.setup();
    renderUi(<FiltersHarness />);
    await user.type(screen.getByRole('textbox', { name: '证券代码' }), 'INVALID');
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(screen.getByText('证券筛选不合法')).toBeVisible();
    expect(screen.getByRole('textbox', { name: '证券代码' })).toHaveValue('INVALID');
    expect(screen.getByLabelText('已应用筛选')).toHaveTextContent('symbol=&side=');
    await user.click(screen.getByRole('button', { name: '重置' }));
    expect(screen.getByRole('textbox', { name: '证券代码' })).toHaveValue('');
    expect(screen.queryByText('证券筛选不合法')).not.toBeInTheDocument();
  });
});
