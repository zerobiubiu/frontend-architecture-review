import {
  Banner,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  EmptyState,
  IconButton,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@astryxdesign/core';
import { IconArrowDown, IconArrowUp, IconColumns3, IconRefresh } from '@tabler/icons-react';
import {
  type ColumnDef,
  type ColumnVisibilityState,
  columnVisibilityFeature,
  coreFeatures,
  flexRender,
  type RowData,
  rowSortingFeature,
  type SortingState,
  useTable,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';

/**
 * 表格功能集：排序 + 列可见性。
 * 不注册分页功能：服务端分页由 props（page/pageSize/totalItems）唯一拥有，避免双分页状态。
 */
export const tableFeatures = {
  ...coreFeatures,
  rowSortingFeature: rowSortingFeature,
  columnVisibilityFeature: columnVisibilityFeature,
} as const;

type DataTableFeatures = typeof tableFeatures;

interface DataTableShellBaseProps<TData extends RowData> {
  /** 服务端返回的数据：当前页或完整列表；保持引用，不在组件内复制。 */
  readonly data: TData[];
  /** 列定义；仅支持单行平列，分组表头暂不支持。 */
  readonly columns: ColumnDef<DataTableFeatures, TData>[];
  readonly sorting?: SortingState;
  readonly onSortingChange?: (sorting: SortingState) => void;
  readonly columnVisibility?: ColumnVisibilityState;
  readonly onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  /** 数据陈旧提示（例如 SSE 提示刷新后尚未重读完成）。 */
  readonly isStale?: boolean;
  readonly title?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly getRowId?: (row: TData) => string;
  readonly rowIndexStart?: number;
}

interface ServerPaginationProps {
  /** 默认沿用服务端分页，页码及总数只由调用方持有。 */
  readonly pagination?: true;
  readonly totalItems: number;
  readonly page: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];
}

interface NoPaginationProps {
  /** 完整返回列表不制造页码、总数或分页回调。 */
  readonly pagination: false;
  readonly totalItems?: never;
  readonly page?: never;
  readonly pageSize?: never;
  readonly onPageChange?: never;
  readonly onPageSizeChange?: never;
  readonly pageSizeOptions?: never;
}

export type DataTableShellProps<TData extends RowData> = DataTableShellBaseProps<TData> &
  (ServerPaginationProps | NoPaginationProps);

const SKELETON_ROWS = [0, 1, 2, 3];

/**
 * DataTableShell：Astryx Table 负责外观与结构，TanStack Table 负责数据逻辑。
 *
 * - 分页/排序/筛选状态只由调用方持有（服务端语义），组件内部不缓存第二份；
 * - Loading / Empty / Error / Stale 是四种独立状态，不互相冒充；
 * - 本阶段不做单元格编辑、Excel 粘贴与虚拟滚动。
 */
export function DataTableShell<TData extends RowData>(props: DataTableShellProps<TData>) {
  const {
    data,
    columns,
    sorting = [],
    onSortingChange,
    columnVisibility = {},
    onColumnVisibilityChange,
    isLoading = false,
    error = null,
    onRetry,
    isStale = false,
    title,
    toolbar,
    emptyTitle = '暂无数据',
    emptyDescription,
    getRowId,
    rowIndexStart,
  } = props;
  const table = useTable({
    features: tableFeatures,
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => {
      if (!onSortingChange) return;
      onSortingChange(typeof updater === 'function' ? updater(sorting) : updater);
    },
    onColumnVisibilityChange: (updater) => {
      if (!onColumnVisibilityChange) return;
      onColumnVisibilityChange(typeof updater === 'function' ? updater(columnVisibility) : updater);
    },
    manualSorting: true,
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
  });

  const rows = table.getRowModel().rows;
  const headerGroups = table.getHeaderGroups();
  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());
  const showEmpty = !isLoading && error === null && rows.length === 0;

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="data-table-shell">
      <div className="flex flex-wrap items-center gap-3">
        {title === undefined ? null : (
          <Text size="lg" weight="semibold">
            {title}
          </Text>
        )}
        <Text size="sm" color="secondary" data-testid="data-table-total">
          {props.pagination === false ? `已返回 ${data.length} 条` : `共 ${props.totalItems} 条`}
        </Text>
        <div className="ms-auto flex items-center gap-2">
          {toolbar}
          {hideableColumns.length > 0 && onColumnVisibilityChange ? (
            <DropdownMenu
              alignment="end"
              button={{ label: '列', variant: 'secondary', size: 'sm', icon: <IconColumns3 size={16} /> }}
            >
              {hideableColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  label={typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
                  value={column.getIsVisible()}
                  onChange={(next) => column.toggleVisibility(next)}
                />
              ))}
            </DropdownMenu>
          ) : null}
          {onRetry ? (
            <IconButton
              icon={<IconRefresh size={16} />}
              label="重新加载"
              variant="ghost"
              size="sm"
              onClick={onRetry}
            />
          ) : null}
        </div>
      </div>

      {error === null ? null : (
        <Banner status="error" title="加载失败" description={error} data-testid="data-table-error" />
      )}

      {isStale && error === null ? (
        <Banner
          status="info"
          title="数据可能已过期"
          description="已收到变更提示，正在等待服务端重新读取完成。"
          data-testid="data-table-stale"
        />
      ) : null}

      {isLoading && rows.length === 0 ? (
        <div className="flex flex-col gap-2" data-testid="data-table-loading">
          <Skeleton height={36} />
          {SKELETON_ROWS.map((index) => (
            <Skeleton key={index} height={30} />
          ))}
        </div>
      ) : null}

      {showEmpty ? <EmptyState title={emptyTitle} description={emptyDescription} isCompact /> : null}

      {rows.length > 0 ? (
        <Table
          aria-label={typeof title === 'string' ? `${title} · 横向滚动区域` : '数据表格 · 横向滚动区域'}
          className="min-w-[48rem]"
          density="compact"
          dividers="rows"
          hasHover
          rowIndexStart={
            rowIndexStart ?? (props.pagination === false ? 1 : (props.page - 1) * props.pageSize + 1)
          }
          rowCount={props.pagination === false ? data.length : props.totalItems}
        >
          <TableHeader>
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  // 只有调用方提供 onSortingChange（服务端支持排序）时才渲染排序按钮，
                  // 避免出现“可点击但无效果”的假控件。
                  const sortable = Boolean(onSortingChange) && header.column.getCanSort();
                  return (
                    <TableHeaderCell
                      key={header.id}
                      {...(sortable
                        ? {
                            'aria-sort':
                              sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none',
                          }
                        : {})}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-start"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <IconArrowUp size={12} aria-hidden />
                          ) : sorted === 'desc' ? (
                            <IconArrowDown size={12} aria-hidden />
                          ) : null}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHeaderCell>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {props.pagination !== false && props.totalItems > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Pagination
            page={props.page}
            onChange={props.onPageChange}
            totalItems={props.totalItems}
            pageSize={props.pageSize}
            {...(props.onPageSizeChange ? { onPageSizeChange: props.onPageSizeChange } : {})}
            pageSizeOptions={[...(props.pageSizeOptions ?? [10, 25, 50])]}
            size="sm"
            isDisabled={isLoading}
          />
        </div>
      ) : null}
    </section>
  );
}
