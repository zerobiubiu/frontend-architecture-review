import type { ColumnDef, ColumnVisibilityState, SortingState } from '@tanstack/react-table';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';

interface Row {
  id: string;
  side: 'BUY' | 'SELL';
  quantity: string;
}

const ROWS: readonly Row[] = Array.from({ length: 25 }, (_, index) => ({
  id: `ORD-${String(index + 1).padStart(3, '0')}`,
  side: index % 2 === 0 ? 'BUY' : 'SELL',
  quantity: `${index + 1}.000`,
}));

const COLUMNS: ColumnDef<typeof tableFeatures, Row>[] = [
  { accessorKey: 'id', header: '订单号' },
  { accessorKey: 'side', header: '方向' },
  { accessorKey: 'quantity', header: '数量' },
];

function Harness({
  error = null,
  isStale = false,
  isLoading = false,
  totalItems = ROWS.length,
  rowsOverride,
}: {
  readonly error?: string | null;
  readonly isStale?: boolean;
  readonly isLoading?: boolean;
  readonly totalItems?: number;
  readonly rowsOverride?: Row[];
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const pageRows = useMemo(
    () => rowsOverride ?? ROWS.slice((page - 1) * pageSize, page * pageSize),
    [rowsOverride, page, pageSize],
  );
  return (
    <div>
      <DataTableShell<Row>
        data={pageRows}
        columns={COLUMNS}
        totalItems={totalItems}
        page={page}
        pageSize={pageSize}
        onPageChange={(next) => setPage(next)}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        sorting={sorting}
        onSortingChange={setSorting}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        error={error}
        isStale={isStale}
        isLoading={isLoading}
        title="演示订单"
        getRowId={(row) => row.id}
      />
      <output data-testid="page-state">
        page={page};size={pageSize};sort={JSON.stringify(sorting)};visibility=
        {JSON.stringify(visibility)}
      </output>
    </div>
  );
}

describe('DataTableShell', () => {
  it('渲染当前页并显示服务端总数', () => {
    render(<Harness />);
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 25 条');
    const table = screen.getByRole('table');
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(10);
    expect(bodyRows[0]).toHaveTextContent('ORD-001');
  });

  it('翻页由调用方唯一拥有，点击后更新页码与数据', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const next = screen.getByRole('button', { name: /next/i });
    await user.click(next);
    expect(screen.getByTestId('page-state')).toHaveTextContent('page=2;');
    const bodyRows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(bodyRows[0]).toHaveTextContent('ORD-011');
  });

  it('排序点击只发出服务端排序状态，不在本地二次排序', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '订单号' }));
    expect(screen.getByTestId('page-state')).toHaveTextContent('sort=[{');
    expect(screen.getByTestId('page-state')).toHaveTextContent('"id":"id"');
    expect(screen.getByRole('button', { name: '订单号' })).toBeInTheDocument();
  });

  it('列可见性菜单更新可见性状态并隐藏列', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole('columnheader', { name: '方向' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '列' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: '方向' }));
    expect(screen.getByTestId('page-state')).toHaveTextContent('visibility={"side":false}');
    expect(screen.queryByRole('columnheader', { name: '方向' })).not.toBeInTheDocument();
  });

  it('错误、陈旧、加载是三种独立状态', () => {
    const { rerender } = render(<Harness error="读取失败" />);
    expect(screen.getByTestId('data-table-error')).toHaveTextContent('读取失败');
    expect(screen.queryByTestId('data-table-stale')).not.toBeInTheDocument();

    rerender(<Harness isStale />);
    expect(screen.getByTestId('data-table-stale')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-error')).not.toBeInTheDocument();

    rerender(<Harness isLoading rowsOverride={[]} />);
    expect(screen.getByTestId('data-table-loading')).toBeInTheDocument();
  });

  it('空结果展示空状态而不是伪造 0 行合计', () => {
    render(<Harness totalItems={0} rowsOverride={[]} />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('上一页按钮只发出页码回调（分页状态由调用方拥有）', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <DataTableShell<Row>
        data={ROWS.slice(0, 10)}
        columns={COLUMNS}
        totalItems={12}
        page={2}
        pageSize={10}
        onPageChange={onPageChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('没有 onSortingChange 时不渲染假排序按钮', () => {
    render(
      <DataTableShell<Row>
        data={ROWS.slice(0, 5)}
        columns={COLUMNS}
        totalItems={5}
        page={1}
        pageSize={10}
        onPageChange={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: '订单号' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '订单号' })).not.toHaveAttribute('aria-sort');
  });

  it('总数真实收缩后合计、页码与按钮状态同步更新', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <DataTableShell<Row>
        data={ROWS.slice(20, 25)}
        columns={COLUMNS}
        totalItems={55}
        page={3}
        pageSize={10}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 55 条');
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();

    rerender(
      <DataTableShell<Row>
        data={ROWS.slice(0, 5)}
        columns={COLUMNS}
        totalItems={5}
        page={1}
        pageSize={10}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 5 条');
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
