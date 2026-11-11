import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { UtcDateTimeField } from '@/components/ui/utc-datetime-field';

function Harness({ initial = '' }: { readonly initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <UtcDateTimeField label="计划开始" value={value} onChange={setValue} />
      <output data-testid="current-value">{value}</output>
    </div>
  );
}

const formSchema = z.object({
  scheduledStartAt: z.string(),
  scheduledStartEditValid: z.boolean().refine((value) => value, '计划开始存在未解决的输入错误'),
});

type FormValues = z.input<typeof formSchema>;

function ExternalHarness() {
  const [value, setValue] = useState('2026-01-15T17:00:00Z');
  return (
    <div>
      <UtcDateTimeField label="计划开始" value={value} onChange={setValue} />
      <button type="button" onClick={() => setValue('2026-07-01T16:00:00Z')}>
        外部更新
      </button>
    </div>
  );
}

function RhfHarness({
  initialValue = '',
  onSubmit,
  readOnly = false,
  disabled = false,
}: {
  readonly initialValue?: string;
  readonly onSubmit: (values: FormValues) => void;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { scheduledStartAt: initialValue, scheduledStartEditValid: true },
    mode: 'onBlur',
  });
  const [resetToken, setResetToken] = useState(0);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Controller
        control={form.control}
        name="scheduledStartAt"
        render={({ field, fieldState }) => (
          <UtcDateTimeField
            label="计划开始"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            resetToken={resetToken}
            isReadOnly={readOnly}
            isDisabled={disabled}
            onEditingStateChange={({ valid }) => {
              if (form.getValues('scheduledStartEditValid') !== valid) {
                form.setValue('scheduledStartEditValid', valid);
              }
            }}
            status={fieldState.error ? { type: 'error', message: fieldState.error.message } : undefined}
          />
        )}
      />
      <button type="submit">提交</button>
      <button
        type="button"
        onClick={() => {
          form.reset();
          setResetToken((token) => token + 1);
        }}
      >
        重置
      </button>
      <output data-testid="form-error">{form.formState.errors.scheduledStartEditValid?.message ?? ''}</output>
    </form>
  );
}

describe('UtcDateTimeField', () => {
  it('保留六位小数秒并同时展示 UTC / 纽约时间', () => {
    render(<Harness initial="2026-03-08T06:30:00.123456Z" />);
    expect(screen.getByRole('textbox', { name: '计划开始' })).toHaveValue('2026-03-08T06:30:00.123456Z');
    const preview = screen.getByTestId('utc-datetime-preview');
    expect(preview).toHaveTextContent('UTC 2026-03-08 06:30:00.123456');
    expect(preview).toHaveTextContent('纽约 2026-03-08 01:30:00.123456');
  });

  it('七位有效小数显示字段错误，且不改写输入', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: '计划开始' });
    await user.type(input, '2026-03-08T06:30:00.1234567Z');
    expect(input).toHaveValue('2026-03-08T06:30:00.1234567Z');
    expect((await screen.findAllByText('小数秒最多六位有效数字（尾随零不计）')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('current-value')).toHaveTextContent('2026-03-08T06:30:00.1234567Z');
  });

  it('拒绝纽约春季不存在的时间', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-01-15T17:00:00Z" />);
    await user.click(screen.getByRole('radio', { name: '纽约时间' }));
    const nyInput = screen.getByRole('textbox', { name: '计划开始（America/New_York 墙钟）' });
    await user.clear(nyInput);
    await user.type(nyInput, '2026-03-08 02:30:00');
    expect((await screen.findAllByText(/DST 跳变/)).length).toBeGreaterThan(0);
    expect(screen.getByTestId('current-value')).toHaveTextContent('');
  });

  it('纽约秋季重复时间要求显式选择，并换算到正确的 UTC', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: '纽约时间' }));
    const nyInput = screen.getByRole('textbox', { name: '计划开始（America/New_York 墙钟）' });
    await user.type(nyInput, '2026-11-01 01:30:00');

    const ambiguous = await screen.findByTestId('dst-ambiguous');
    const candidates = within(ambiguous).getAllByRole('radio');
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.closest('label') ?? ambiguous).toHaveTextContent('UTC-04:00');
    expect(candidates[1]?.closest('label') ?? ambiguous).toHaveTextContent('UTC-05:00');

    await user.click(candidates[1] as HTMLElement);
    expect(screen.getByTestId('current-value')).toHaveTextContent('2026-11-01T06:30:00Z');
    expect(screen.getByTestId('utc-datetime-preview')).toHaveTextContent('纽约 2026-11-01 01:30:00');
  });

  it('纽约唯一时间直接换算为 UTC 并保留小数秒', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: '纽约时间' }));
    const nyInput = screen.getByRole('textbox', { name: '计划开始（America/New_York 墙钟）' });
    await user.type(nyInput, '2026-01-15 09:30:00.250000');
    expect(screen.getByTestId('current-value')).toHaveTextContent('2026-01-15T14:30:00.250000Z');
  });
});

describe('UtcDateTimeField + RHF：草稿有效性必须参与提交门禁', () => {
  async function openNewYork(user: UserEvent) {
    await user.click(screen.getByRole('radio', { name: '纽约时间' }));
    return screen.getByRole('textbox', { name: '计划开始（America/New_York 墙钟）' });
  }

  it('春季 gap 未解决时真实提交回调不执行', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RhfHarness initialValue="2026-03-08T06:30:00Z" onSubmit={onSubmit} />);
    const nyInput = await openNewYork(user);
    await user.clear(nyInput);
    await user.type(nyInput, '2026-03-08 02:30:00');
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('form-error')).toHaveTextContent('计划开始存在未解决的输入错误');
  });

  it('秋季 fold 未选择候选时提交被阻止，选择后提交正确 UTC', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RhfHarness onSubmit={onSubmit} />);
    const nyInput = await openNewYork(user);
    await user.type(nyInput, '2026-11-01 01:30:00');
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).not.toHaveBeenCalled();

    const ambiguous = screen.getByTestId('dst-ambiguous');
    await user.click(within(ambiguous).getAllByRole('radio')[1] as HTMLElement);
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      scheduledStartAt: '2026-11-01T06:30:00Z',
      scheduledStartEditValid: true,
    });
  });

  it('可选字段为空时，无效纽约草稿同样不能通过提交', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RhfHarness onSubmit={onSubmit} />);
    const nyInput = await openNewYork(user);
    await user.type(nyInput, 'not-a-time');
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('明确清空按空值提交', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RhfHarness initialValue="2026-01-15T17:00:00Z" onSubmit={onSubmit} />);
    await openNewYork(user);
    await user.click(screen.getByRole('button', { name: '清空时间' }));
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ scheduledStartAt: '' });
  });

  it('重置清除旧草稿并按当前值重建', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RhfHarness initialValue="2026-03-08T06:30:00Z" onSubmit={onSubmit} />);
    const nyInput = await openNewYork(user);
    await user.clear(nyInput);
    await user.type(nyInput, '2026-03-08 02:30:00');
    await user.click(screen.getByRole('button', { name: '重置' }));
    expect(screen.getByRole('textbox', { name: '计划开始（America/New_York 墙钟）' })).toHaveValue(
      '2026-03-08 01:30:00',
    );
  });

  it('切换到纽约模式时用当前 UTC 初始化草稿', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-01-15T17:00:00Z" />);
    await user.click(screen.getByRole('radio', { name: '纽约时间' }));
    expect(screen.getByRole('textbox', { name: '计划开始（America/New_York 墙钟）' })).toHaveValue(
      '2026-01-15 12:00:00',
    );
  });

  it('外部 value 更新时同步草稿', async () => {
    const user = userEvent.setup();
    render(<ExternalHarness />);
    await user.click(screen.getByRole('radio', { name: '纽约时间' }));
    await user.click(screen.getByRole('button', { name: '外部更新' }));
    expect(screen.getByRole('textbox', { name: '计划开始（America/New_York 墙钟）' })).toHaveValue(
      '2026-07-01 12:00:00',
    );
  });

  it('readonly 下候选与模式切换都不能改值', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<RhfHarness onSubmit={onSubmit} />);
    const nyInput = await openNewYork(user);
    await user.type(nyInput, '2026-11-01 01:30:00');
    rerender(<RhfHarness onSubmit={onSubmit} readOnly />);

    const radios = within(screen.getByTestId('dst-ambiguous')).getAllByRole('radio');
    for (const radio of radios) expect(radio).toBeDisabled();
    fireEvent.click(radios[1] as HTMLElement);
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disabled 下不能切换到纽约模式', async () => {
    const user = userEvent.setup();
    render(<RhfHarness onSubmit={vi.fn()} disabled />);
    await user.click(screen.getByRole('radio', { name: '纽约时间' }));
    expect(screen.getByRole('textbox', { name: '计划开始' })).toBeInTheDocument();
    expect(screen.queryByTestId('new-york-datetime-input')).not.toBeInTheDocument();
  });
});
