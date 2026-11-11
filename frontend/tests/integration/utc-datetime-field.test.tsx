import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
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

describe('UtcDateTimeField', () => {
  it('保留六位小数秒并同时展示 UTC / 纽约时间', () => {
    render(<Harness initial="2026-03-08T06:30:00.123456Z" />);
    expect(screen.getByRole('textbox', { name: '计划开始' })).toHaveValue('2026-03-08T06:30:00.123456Z');
    const preview = screen.getByTestId('utc-datetime-preview');
    expect(preview).toHaveTextContent('UTC 2026-03-08 06:30:00.123456');
    expect(preview).toHaveTextContent('纽约 2026-03-08 01:30:00.123456');
  });

  it('七位小数秒显示字段错误，且不改写输入', async () => {
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
