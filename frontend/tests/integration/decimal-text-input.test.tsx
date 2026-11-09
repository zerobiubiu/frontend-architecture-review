import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DecimalTextInput } from '@/components/ui/decimal-text-input';
import { isDecimalString } from '@/lib/decimal/decimal';

function ControlledHarness({ initial = '' }: { readonly initial?: string }) {
  const [value, setValue] = useState(initial);
  return <DecimalTextInput label="本金" value={value} onChange={setValue} prefix="$" suffix="USDC" />;
}

describe('DecimalTextInput', () => {
  it('保留用户输入的完整字符串，不做钳制或舍入', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);
    const input = screen.getByRole('textbox', { name: '本金' });
    await user.clear(input);
    await user.type(input, '0.100000000000000001');
    expect(input).toHaveValue('0.100000000000000001');
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });

  it('允许输入中间态，不自动补零或删除尾点', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);
    const input = screen.getByRole('textbox', { name: '本金' });
    await user.clear(input);
    await user.type(input, '12.');
    expect(input).toHaveValue('12.');
  });

  it('disabled 与 readOnly 都不改变值', () => {
    render(
      <div>
        <DecimalTextInput label="禁用" value="1.2300" onChange={() => undefined} isDisabled />
        <DecimalTextInput label="只读" value="1.2300" onChange={() => undefined} isReadOnly />
      </div>,
    );
    const disabled = screen.getByRole('textbox', { name: '禁用' });
    const readOnly = screen.getByRole('textbox', { name: '只读' });
    // Astryx 用 aria-disabled + readonly 保留可聚焦的禁用说明，而不是原生 disabled。
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(readOnly).toHaveAttribute('readonly');
    expect(disabled).toHaveValue('1.2300');
    expect(readOnly).toHaveValue('1.2300');
  });
});

const schema = z.object({
  price: z
    .string()
    .min(1, '请输入限价')
    .refine(isDecimalString, '限价必须是十进制数字')
    .refine((value) => (value.split('.')[1] ?? '').length <= 2, '限价最多两位小数'),
});
type FormValues = z.input<typeof schema>;

function RhfHarness({ onSubmit }: { readonly onSubmit: (values: FormValues) => void }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { price: '' },
    mode: 'onBlur',
  });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Controller
        control={form.control}
        name="price"
        render={({ field, fieldState }) => (
          <DecimalTextInput
            label="限价"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            status={fieldState.error ? { type: 'error', message: fieldState.error.message } : undefined}
          />
        )}
      />
      <button type="submit">提交</button>
    </form>
  );
}

describe('DecimalTextInput + React Hook Form + Zod', () => {
  it('展示字段错误，并通过 Controller 提交原始字符串', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RhfHarness onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox', { name: '限价' }), '1.234');
    await user.tab();
    expect(await screen.findByText('限价最多两位小数')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('textbox', { name: '限价' }));
    await user.type(screen.getByRole('textbox', { name: '限价' }), '0.100000000000000001');
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).toHaveBeenCalledTimes(0);

    await user.clear(screen.getByRole('textbox', { name: '限价' }));
    await user.type(screen.getByRole('textbox', { name: '限价' }), '1.25');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ price: '1.25' });
  });
});
