import {
  AlertDialog,
  Badge,
  Banner,
  Button,
  Card,
  CheckboxInput,
  Dialog,
  DialogHeader,
  Drawer,
  DrawerHeader,
  DropdownMenu,
  DropdownMenuItem,
  EmptyState,
  Icon,
  IconButton,
  Popover,
  ProgressBar,
  RadioList,
  RadioListItem,
  Selector,
  Skeleton,
  StatusDot,
  Switch,
  Text,
  TextArea,
  TextInput,
  useToast,
} from '@astryxdesign/core';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  IconAlertTriangle,
  IconArrowUp,
  IconCircleCheck,
  IconCopy,
  IconDownload,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { onlineManager } from '@tanstack/react-query';
import type { ColumnDef, ColumnVisibilityState, SortingState } from '@tanstack/react-table';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useThemeMode } from '@/app/providers/theme-provider';
import { ThemeModeToggle } from '@/components/shared/theme-mode-toggle';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import { DecimalTextInput } from '@/components/ui/decimal-text-input';
import { UtcDateTimeField } from '@/components/ui/utc-datetime-field';
import { compareDecimal, isDecimalString } from '@/lib/decimal/decimal';
import { formatDecimal } from '@/lib/format/number';
import { parseUtcInstant } from '@/lib/time/instant';
import { createSensitiveWriteGate, SensitiveWriteBlockedError } from '@/services/api/sensitive-write';

const SYMBOLS = [
  { value: 'AAPL', label: 'AAPL · Apple' },
  { value: 'MSFT', label: 'MSFT · Microsoft' },
  { value: 'NVDA', label: 'NVDA · NVIDIA' },
];

const decimalField = (label: string) =>
  z
    .string()
    .min(1, `请输入${label}`)
    .refine(isDecimalString, `${label}必须是十进制数字（不接受指数与千分位）`);

const orderDraftSchema = z.object({
  symbol: z.string().min(1, '请选择证券'),
  price: decimalField('限价').refine(
    (value) => (value.split('.')[1] ?? '').length <= 2,
    '限价最多两位小数；本表单不会自动舍入',
  ),
  quantity: decimalField('股数').refine(
    (value) => (value.split('.')[1] ?? '').length <= 10,
    '股数最多十位小数；本表单不会自动截断',
  ),
  orderType: z.enum(['LIMIT', 'MARKET']),
  scheduledStartAt: z
    .string()
    .refine((value) => value === '' || parseUtcInstant(value).ok, '计划开始必须是合法 UTC 时间'),
  // 字段编辑有效性由 UtcDateTimeField 提供；纽约草稿无效/未消歧时必须阻止提交。
  scheduledStartEditValid: z.boolean().refine((value) => value, '计划开始存在未解决的输入错误'),
  acknowledged: z.boolean().refine((value) => value, '必须确认这只是演示表单'),
});

type OrderFormInput = z.input<typeof orderDraftSchema>;
type OrderFormOutput = z.output<typeof orderDraftSchema>;

interface DemoOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  status: 'ACCEPTED' | 'FILLED' | 'UNKNOWN';
  createdAt: string;
}

const STATUS_LABEL: Record<DemoOrder['status'], string> = {
  ACCEPTED: '已受理',
  FILLED: '已成交',
  UNKNOWN: '结果未知',
};

const STATUS_VARIANT: Record<DemoOrder['status'], 'success' | 'accent' | 'warning'> = {
  ACCEPTED: 'accent',
  FILLED: 'success',
  UNKNOWN: 'warning',
};

const DEMO_ORDERS: readonly DemoOrder[] = Array.from({ length: 57 }, (_, index) => {
  const symbols = ['AAPL', 'MSFT', 'NVDA'] as const;
  const statuses = ['ACCEPTED', 'FILLED', 'UNKNOWN'] as const;
  const minutes = String(index % 60).padStart(2, '0');
  return {
    id: `DEMO-${String(index + 1).padStart(4, '0')}`,
    symbol: symbols[index % symbols.length] ?? 'AAPL',
    side: index % 2 === 0 ? 'BUY' : 'SELL',
    quantity: `${10 + index}.${String(index % 1000).padStart(3, '0')}`,
    price: `${180 + (index % 40)}.${String((index * 7) % 100).padStart(2, '0')}`,
    status: statuses[index % statuses.length] ?? 'ACCEPTED',
    createdAt: `2026-11-10T09:${minutes}:00Z`,
  };
});

function Section({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <Card padding={4}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Text as="h2" size="base" weight="semibold">
            {title}
          </Text>
          {description ? (
            <Text size="sm" color="secondary">
              {description}
            </Text>
          ) : null}
        </div>
        {children}
      </div>
    </Card>
  );
}

export function PlaygroundPage() {
  const toast = useToast();
  const { mode, resolvedMode } = useThemeMode();

  const [textValue, setTextValue] = useState('示例文本');
  const [textAreaValue, setTextAreaValue] = useState('第一行\n第二行');
  const [selectorValue, setSelectorValue] = useState('AAPL');
  const [checked, setChecked] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [radioValue, setRadioValue] = useState('limit');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [alertResult, setAlertResult] = useState<string | null>(null);

  const [decimalValue, setDecimalValue] = useState('0.123456789012345678');
  const [utcValue, setUtcValue] = useState('2026-03-08T06:30:00.123456Z');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [simulateStale, setSimulateStale] = useState(false);
  const [simulateError, setSimulateError] = useState(false);
  const [simulateLoading, setSimulateLoading] = useState(false);

  const form = useForm<OrderFormInput, unknown, OrderFormOutput>({
    resolver: zodResolver(orderDraftSchema),
    defaultValues: {
      symbol: '',
      price: '',
      quantity: '',
      orderType: 'LIMIT',
      scheduledStartAt: '',
      scheduledStartEditValid: true,
      acknowledged: false,
    },
    mode: 'onBlur',
  });
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [scheduledResetToken, setScheduledResetToken] = useState(0);
  const [sensitiveWriteState, setSensitiveWriteState] = useState('idle');
  const sensitiveAttempts = useRef(0);
  const sensitiveGate = useMemo(
    () =>
      createSensitiveWriteGate({
        isOnline: () => onlineManager.isOnline(),
        getSessionEpoch: () => 1,
        getAccountId: () => 'demo-account',
        isConfirmationCurrent: (id) => id === 'demo-confirmation',
      }),
    [],
  );

  const columns = useMemo<ColumnDef<typeof tableFeatures, DemoOrder>[]>(
    () => [
      { accessorKey: 'id', header: '订单号' },
      { accessorKey: 'symbol', header: '证券' },
      {
        accessorKey: 'side',
        header: '方向',
        cell: (info) => (
          <Badge
            variant={info.getValue() === 'BUY' ? 'success' : 'warning'}
            label={info.getValue() === 'BUY' ? '买入' : '卖出'}
          />
        ),
      },
      { accessorKey: 'quantity', header: '股数' },
      {
        accessorKey: 'price',
        header: '价格',
        cell: (info) => formatDecimal(String(info.getValue()), { maximumFractionDigits: 2 }) ?? '—',
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: (info) => {
          const status = info.getValue() as DemoOrder['status'];
          return (
            <span className="inline-flex items-center gap-2">
              <StatusDot variant={STATUS_VARIANT[status]} label={STATUS_LABEL[status]} />
              <Text size="sm">{STATUS_LABEL[status]}</Text>
            </span>
          );
        },
      },
      { accessorKey: 'createdAt', header: '创建时间（UTC）' },
    ],
    [],
  );

  const sortedOrders = useMemo(() => {
    const first = sorting[0];
    if (!first) return DEMO_ORDERS;
    const key = first.id as keyof DemoOrder;
    return [...DEMO_ORDERS].sort((left, right) => {
      const result = String(left[key]).localeCompare(String(right[key]), 'en');
      return first.desc ? -result : result;
    });
  }, [sorting]);

  const pageRows = useMemo(
    () => sortedOrders.slice((page - 1) * pageSize, page * pageSize),
    [sortedOrders, page, pageSize],
  );

  const parsedDecimal = parseUtcInstant('2026-03-08T02:30:00Z');
  const decimalComparison = compareDecimal(decimalValue, '0.123456789012345677');

  const onSubmit = (values: OrderFormOutput) => {
    setSubmitted(JSON.stringify(values, null, 2));
    toast({ body: '演示表单已通过 Zod 校验（未提交任何交易）', type: 'info' });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="playground">
      <div className="flex flex-col gap-2">
        <Text as="h1" size="lg" weight="semibold">
          Engineering Playground
        </Text>
        <Text color="secondary">
          仅用于开发环境验证组件、主题与交互；所有数据均为本地 Mock，不连接后端，不执行任何真实交易。
        </Text>
      </div>

      <Section
        title="主题 / 图标 / Tailwind / 响应式"
        description="主题模式由 Astryx Theme 统一驱动；图标走 Tabler → Astryx 语义注册表；布局用 Tailwind 工具类，颜色来自主题桥接。"
      >
        <div className="flex flex-wrap items-center gap-3">
          <ThemeModeToggle />
          <Badge variant="neutral" label={`模式 ${mode}`} />
          <Badge variant="blue" label={`当前解析 ${resolvedMode}`} />
        </div>
        <div className="flex flex-wrap items-center gap-4" data-testid="icon-row">
          <Icon icon="close" label="关闭（语义图标）" />
          <Icon icon="search" label="搜索（语义图标）" />
          <Icon icon="warning" label="警告（语义图标）" />
          <IconArrowUp size={18} aria-hidden />
          <IconCircleCheck size={18} aria-hidden />
          <IconCopy size={18} aria-hidden />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="tailwind-grid">
          <div className="rounded-lg border border-border bg-surface p-3">
            <Text size="sm">bg-surface + border-border</Text>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <Text size="sm">bg-card</Text>
          </div>
          <div className="rounded-lg border border-border bg-muted p-3">
            <Text size="sm">bg-muted</Text>
          </div>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Button / IconButton">
          <div className="flex flex-wrap items-center gap-2">
            <Button label="主要动作" onClick={() => toast({ body: '已点击主要按钮' })} />
            <Button label="次要动作" variant="secondary" />
            <Button label="危险动作" variant="destructive" />
            <Button label="加载中" isLoading />
            <Button label="禁用" isDisabled />
            <IconButton icon={<IconPlus size={16} />} label="新增" variant="secondary" />
            <IconButton icon={<IconTrash size={16} />} label="删除" variant="ghost" />
          </div>
        </Section>

        <Section title="Badge / StatusDot / ProgressBar / Skeleton">
          <div className="flex flex-wrap items-center gap-2">
            <Badge label="neutral" />
            <Badge variant="success" label="success" />
            <Badge variant="warning" label="warning" />
            <Badge variant="error" label="error" />
            <Badge variant="blue" label="blue" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2">
              <StatusDot variant="success" label="在线" tooltip="连接正常" />
              <Text size="sm">在线</Text>
            </span>
            <span className="inline-flex items-center gap-2">
              <StatusDot variant="warning" label="陈旧" tooltip="数据可能过期" isPulsing />
              <Text size="sm">陈旧</Text>
            </span>
            <span className="inline-flex items-center gap-2">
              <StatusDot variant="error" label="异常" />
              <Text size="sm">异常</Text>
            </span>
            <span className="inline-flex items-center gap-2">
              <StatusDot variant="neutral" label="未知" />
              <Text size="sm">未知</Text>
            </span>
          </div>
          <ProgressBar value={42} max={100} label="演示进度" hasValueLabel />
          <Skeleton height={16} />
        </Section>

        <Section title="TextInput / TextArea / Selector">
          <div className="flex flex-col gap-3">
            <TextInput label="普通文本" value={textValue} onChange={setTextValue} />
            <TextArea
              label="多行文本"
              value={textAreaValue}
              onChange={setTextAreaValue}
              rows={3}
              description="受控字符串，与 RHF Controller 可直接对接"
            />
            <Selector
              label="证券"
              value={selectorValue}
              onChange={setSelectorValue}
              options={SYMBOLS}
              hasSearch
            />
          </div>
        </Section>

        <Section title="Checkbox / Switch / Radio">
          <div className="flex flex-col gap-3">
            <CheckboxInput label="勾选示例" value={checked} onChange={setChecked} />
            <Switch label="开关示例" value={switchOn} onChange={setSwitchOn} />
            <RadioList label="订单类型" value={radioValue} onChange={setRadioValue}>
              <RadioListItem value="limit" label="限价" />
              <RadioListItem value="market" label="市价" description="演示选项，不产生真实委托" />
            </RadioList>
          </div>
        </Section>

        <Section title="Dialog / AlertDialog / Drawer（Portal 验证）">
          <div className="flex flex-wrap gap-2">
            <Button label="打开 Dialog" variant="secondary" onClick={() => setDialogOpen(true)} />
            <Button label="打开 AlertDialog" variant="secondary" onClick={() => setAlertOpen(true)} />
            <Button label="打开 Drawer" variant="secondary" onClick={() => setDrawerOpen(true)} />
          </div>
          {alertResult ? <Banner status="info" title="AlertDialog 结果" description={alertResult} /> : null}
          <Dialog isOpen={dialogOpen} onOpenChange={setDialogOpen} width={420}>
            <DialogHeader title="示例 Dialog" subtitle="验证焦点管理与 Esc 关闭" />
            <div className="flex flex-col gap-3 py-3">
              <Text size="sm" color="secondary">
                Dialog 渲染在 Portal 中；主题通过根 Theme 同步到 documentElement，暗色模式下也应正常。
              </Text>
              <TextInput label="Dialog 内输入" value={textValue} onChange={setTextValue} />
            </div>
            <div className="flex justify-end gap-2">
              <Button label="取消" variant="secondary" onClick={() => setDialogOpen(false)} />
              <Button label="确认" onClick={() => setDialogOpen(false)} />
            </div>
          </Dialog>
          <AlertDialog
            isOpen={alertOpen}
            onOpenChange={setAlertOpen}
            title="确认演示动作？"
            description="该对话框只修改页面内本地状态，不代表任何真实操作。"
            cancelLabel="取消"
            actionLabel="确认"
            onAction={() => {
              setAlertResult('已在本地确认（无后端调用）');
              setAlertOpen(false);
            }}
          />
          <Drawer isOpen={drawerOpen} onOpenChange={setDrawerOpen} side="end" width={360} label="示例抽屉">
            <DrawerHeader title="示例 Drawer" subtitle="从右侧滑出" onOpenChange={setDrawerOpen} />
            <div className="py-3">
              <Text size="sm" color="secondary">
                抽屉内容同样位于 Portal；关闭后焦点回到触发按钮。
              </Text>
            </div>
          </Drawer>
        </Section>

        <Section title="DropdownMenu / Tooltip / Popover / Toast">
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu button={{ label: '操作菜单', variant: 'secondary', size: 'sm' }}>
              <DropdownMenuItem
                label="复制订单号"
                icon={<IconCopy size={16} />}
                onClick={() => toast({ body: '已复制（演示）' })}
              />
              <DropdownMenuItem label="导出" icon={<IconDownload size={16} />} />
              <DropdownMenuItem
                label="危险操作"
                icon={<IconAlertTriangle size={16} />}
                variant="destructive"
                onClick={() => setAlertOpen(true)}
              />
            </DropdownMenu>

            <Popover
              label="演示 Popover"
              content={<Text size="sm">这是 Popover 内容，支持点击外部关闭。</Text>}
            >
              {(props) => <Button {...props} label="打开 Popover" variant="secondary" size="sm" />}
            </Popover>

            <Button
              label="显示 Toast"
              variant="secondary"
              size="sm"
              onClick={() => toast({ body: '这是一条演示 Toast', type: 'info' })}
            />
            <Button
              label="显示错误 Toast"
              variant="secondary"
              size="sm"
              onClick={() => toast({ body: '错误 Toast 不会自动消失', type: 'error' })}
            />
          </div>
        </Section>

        <Section title="Banner / EmptyState">
          <div className="flex flex-col gap-3">
            <Banner status="info" title="信息" description="SSE 只做资源失效提示，不承载业务事实。" />
            <Banner status="warning" title="陈旧数据" description="数据可能已过期，需重新读取后再判断。" />
            <Banner status="error" title="错误" description="HTTP 非 2xx 时仍需消费 operation 回执。" />
            <EmptyState title="暂无数据" description="空结果与未知结果含义不同。" isCompact />
          </div>
        </Section>
      </div>

      <Section
        title="DecimalTextInput（字符串精度）"
        description="不转 Number、不钳制、不舍入；格式化只用于展示，绝不回填。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <DecimalTextInput
            label="本金"
            value={decimalValue}
            onChange={setDecimalValue}
            prefix="$"
            suffix="USDC"
            description="允许任意长度小数，用于验证输入不被截断"
          />
          <div className="flex flex-col gap-2">
            <Text size="sm" color="secondary">
              原值：{decimalValue}
            </Text>
            <Text size="sm" color="secondary">
              展示（最多 18 位小数）：{formatDecimal(decimalValue, { maximumFractionDigits: 18 }) ?? '无效'}
            </Text>
            <Text size="sm" color="secondary">
              与 0.123456789012345677 比较：
              {decimalComparison === null
                ? '无法比较'
                : decimalComparison === 0
                  ? '相等'
                  : decimalComparison > 0
                    ? '更大'
                    : '更小'}
            </Text>
          </div>
          <DecimalTextInput
            label="只读数值"
            value="1234567890.123456789"
            onChange={() => undefined}
            isReadOnly
            description="只读时仍保留完整字符串"
          />
          <DecimalTextInput
            label="错误状态"
            value="12,5"
            onChange={() => undefined}
            status={{ type: 'error', message: '含千分位逗号，不是合法十进制字符串' }}
          />
        </div>
      </Section>

      <Section
        title="UtcDateTimeField（UTC / 纽约 / DST）"
        description="原始 UTC 字符串是唯一权威值；最多六位小数秒；春季不存在时间拒绝，秋季重复时间必须显式选择。"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <UtcDateTimeField
            label="计划开始"
            value={utcValue}
            onChange={setUtcValue}
            description="切换到“纽约时间”后可测试 2026-03-08 02:30（不存在）与 2026-11-01 01:30（重复）"
          />
          <div className="flex flex-col gap-2">
            <Text size="sm" color="secondary">
              当前表单值：{utcValue || '（空）'}
            </Text>
            <Text size="sm" color="secondary">
              UTC 样例解析：{parsedDecimal.ok ? parsedDecimal.value.raw : '无效'}
            </Text>
            <div className="flex flex-wrap gap-2">
              <Button
                label="六位小数样例"
                size="sm"
                variant="secondary"
                onClick={() => setUtcValue('2026-03-08T06:30:00.123456Z')}
              />
              <Button
                label="七位小数（应报错）"
                size="sm"
                variant="secondary"
                onClick={() => setUtcValue('2026-03-08T06:30:00.1234567Z')}
              />
              <Button
                label="秋季重复（纽约 01:30）"
                size="sm"
                variant="secondary"
                onClick={() => setUtcValue('2026-11-01T05:30:00Z')}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="DataTableShell（服务端分页 + 列可见性 + 状态）"
        description="分页状态只有页面一个拥有者；TanStack 只负责列定义、排序与可见性，不启用客户端分页。"
      >
        <div className="flex flex-wrap items-center gap-4">
          <Switch label="模拟陈旧" value={simulateStale} onChange={setSimulateStale} />
          <Switch label="模拟加载失败" value={simulateError} onChange={setSimulateError} />
          <Switch label="模拟加载中" value={simulateLoading} onChange={setSimulateLoading} />
        </div>
        <DataTableShell<DemoOrder>
          data={pageRows}
          columns={columns}
          totalItems={DEMO_ORDERS.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          sorting={sorting}
          onSortingChange={setSorting}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          isLoading={simulateLoading}
          error={simulateError ? '演示错误：服务端读取失败，请按原操作标识核对' : null}
          isStale={simulateStale}
          title="演示订单"
          getRowId={(order) => order.id}
          emptyTitle="没有演示订单"
          emptyDescription="切换筛选或重新加载后再试。"
        />
      </Section>

      <Section
        title="敏感写 fail-fast 门禁（仅演示，不发 Fetch）"
        description="离线时立即失败，不进入可在恢复网络后自动发送的队列；恢复网络不构成新的用户确认。"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            label="尝试敏感写（演示）"
            variant="secondary"
            onClick={() => {
              void sensitiveGate
                .run(
                  {
                    confirmationId: 'demo-confirmation',
                    expectedSessionEpoch: 1,
                    expectedAccountId: 'demo-account',
                  },
                  async () => {
                    sensitiveAttempts.current += 1;
                  },
                )
                .then(
                  () => setSensitiveWriteState('sent'),
                  (error: unknown) =>
                    setSensitiveWriteState(
                      error instanceof SensitiveWriteBlockedError ? `blocked:${error.reason}` : 'error',
                    ),
                );
            }}
          />
          <Text size="sm" color="secondary" data-testid="sensitive-write-state">
            状态：{sensitiveWriteState}
          </Text>
          <Text size="sm" color="secondary" data-testid="sensitive-write-attempts">
            已发送：{sensitiveAttempts.current}
          </Text>
        </div>
      </Section>

      <Section
        title="React Hook Form + Zod + Astryx 适配"
        description="Controller 显式映射空值；z.input 作为表单值，提交时得到 z.output；错误由字段 status 呈现。本表单是演示模型，字段未与后端订单契约对齐，不作为接口验收依据。"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          data-testid="rhf-form"
        >
          <Banner
            status="info"
            title="演示模型"
            description="本表单用于验证 RHF + Zod + Astryx 适配与提交门禁，字段/枚举未与后端订单契约对齐，不作为接口验收依据。"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Controller
              control={form.control}
              name="symbol"
              render={({ field, fieldState }) => (
                <Selector
                  label="证券"
                  options={SYMBOLS}
                  value={field.value}
                  onChange={field.onChange}
                  isRequired
                  status={fieldState.error ? { type: 'error', message: fieldState.error.message } : undefined}
                />
              )}
            />

            <Controller
              control={form.control}
              name="orderType"
              render={({ field }) => (
                <Selector
                  label="订单类型（演示，不对应后端字段契约）"
                  options={[
                    { value: 'LIMIT', label: '限价' },
                    { value: 'MARKET', label: '市价' },
                  ]}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                  isRequired
                />
              )}
            />

            <Controller
              control={form.control}
              name="price"
              render={({ field, fieldState }) => (
                <DecimalTextInput
                  label="限价"
                  value={field.value}
                  onChange={field.onChange}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  prefix="$"
                  suffix="USD"
                  isDisabled={form.watch('orderType') === 'MARKET'}
                  description="禁用字段仍由表单值决定是否提交，不从 DOM 反推"
                  status={fieldState.error ? { type: 'error', message: fieldState.error.message } : undefined}
                />
              )}
            />

            <Controller
              control={form.control}
              name="quantity"
              render={({ field, fieldState }) => (
                <DecimalTextInput
                  label="股数"
                  value={field.value}
                  onChange={field.onChange}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  suffix="股"
                  isRequired
                  status={fieldState.error ? { type: 'error', message: fieldState.error.message } : undefined}
                />
              )}
            />

            <Controller
              control={form.control}
              name="scheduledStartAt"
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-2">
                  <UtcDateTimeField
                    label="计划开始（可选）"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    resetToken={scheduledResetToken}
                    onEditingStateChange={({ valid }) => {
                      if (form.getValues('scheduledStartEditValid') !== valid) {
                        form.setValue('scheduledStartEditValid', valid);
                      }
                    }}
                    status={
                      fieldState.error ? { type: 'error', message: fieldState.error.message } : undefined
                    }
                  />
                  {form.formState.errors.scheduledStartEditValid ? (
                    <Banner
                      status="error"
                      title="计划开始未完成"
                      description={form.formState.errors.scheduledStartEditValid.message}
                    />
                  ) : null}
                </div>
              )}
            />

            <div className="flex flex-col gap-3">
              <Controller
                control={form.control}
                name="acknowledged"
                render={({ field, fieldState }) => (
                  <CheckboxInput
                    label="我确认这只是演示表单"
                    value={field.value}
                    onChange={field.onChange}
                    status={
                      fieldState.error ? { type: 'error', message: fieldState.error.message } : undefined
                    }
                  />
                )}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" label="校验演示表单" />
            <Button
              type="button"
              label="重置"
              variant="secondary"
              onClick={() => {
                form.reset();
                setScheduledResetToken((token) => token + 1);
                setSubmitted(null);
              }}
            />
            <Text size="sm" color="secondary">
              提交只打印校验结果，不发出网络请求。
            </Text>
          </div>

          {submitted ? (
            <pre
              className="overflow-auto rounded-lg border border-border bg-muted p-3 text-xs"
              data-testid="submitted-json"
            >
              {submitted}
            </pre>
          ) : null}
        </form>
      </Section>
    </div>
  );
}
