import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JsonDetails } from '@/components/read-only/object-details';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';

function displayedDecimal(raw: string): string {
  return screen.getByTitle(raw).textContent?.replaceAll(',', '') ?? '';
}

describe('只读金额与状态', () => {
  it('高精度金额的分组展示保留全部有效位与小数尾零', () => {
    const raw = '12345678901234567890.12345678901234567800';
    render(<DecimalValue value={raw} currency="USDC" />);

    expect(displayedDecimal(raw)).toBe(raw);
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });

  it.each(['-123456789012345678.00000000000000000100', '-0.0000000000'])(
    '负数 %s 不丢失符号或小数位',
    (raw) => {
      render(<DecimalValue value={raw} />);
      expect(displayedDecimal(raw)).toBe(raw);
    },
  );

  it.each([null, undefined])('未返回的金额 %s 不伪造为零', (value) => {
    const { container } = render(<DecimalValue value={value} />);
    expect(container).not.toHaveTextContent(/\d/);
  });

  it('极端金额仍完整可读，不显示 Infinity 或截断后的近似值', () => {
    const raw = `${'9'.repeat(400)}.00100`;
    const { container } = render(<DecimalValue value={raw} />);

    expect(displayedDecimal(raw)).toBe(raw);
    expect(container).not.toHaveTextContent(/Infinity|∞/);
  });

  it('Intl 不支持原始小数位时诚实保留原串，不降低精度', () => {
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(() => {
      throw new RangeError('运行时不支持该小数位范围');
    });
    const raw = `0.${'1234567890'.repeat(20)}00`;
    render(<DecimalValue value={raw} />);

    expect(screen.getByText(raw)).toBeInTheDocument();
    expect(screen.getByText(/显示原值/)).toBeInTheDocument();
  });

  it('未知状态不补成成功或已连接；真实状态保留原串', () => {
    const { container, rerender } = render(<StatusValue value={null} />);
    expect(container).not.toHaveTextContent(/SUCCEEDED|CONNECTED/);

    rerender(<StatusValue value="FILLED" />);
    expect(screen.getByText('FILLED')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/SUCCEEDED|CONNECTED/);
  });
});

describe('只读 UTC', () => {
  it.each(['2026-11-11T03:04:05.123400Z', '2026-11-11T03:04:05.123456000Z'])(
    '真实 Intl 辅助展示保留微秒与尾零，并可访问完整原串 %s',
    (raw) => {
      render(<UtcValue value={raw} />);
      const time = screen.getByText(`${raw.replace('T', ' ').slice(0, -1)} UTC`);

      expect(time.textContent).toContain(raw.slice(20, -1));
    },
  );

  it('历史九位有效小数不能转换时，保留完整 UTC 并说明未转换', () => {
    const raw = '2026-11-11T03:04:05.123456789Z';
    render(<UtcValue value={raw} />);

    expect(screen.getByText(raw)).toBeInTheDocument();
    expect(screen.getByText(/未转换/)).toBeInTheDocument();
    expect(screen.queryByText('2026-11-11 03:04:05.123456 UTC')).not.toBeInTheDocument();
  });

  it('Intl 转换失败仍展示原始 UTC，而不是伪造展示时间', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('运行时无法完成时区转换');
    });
    const raw = '2026-11-11T03:04:05.000001Z';
    render(<UtcValue value={raw} />);

    expect(screen.getByText(raw)).toBeInTheDocument();
    expect(screen.getByText(/未转换/)).toBeInTheDocument();
  });

  it('无时间不显示 epoch 或当前时间', () => {
    const { container } = render(<UtcValue value={undefined} />);
    expect(container).not.toHaveTextContent(/\d/);
  });
});

describe('只读详情', () => {
  it('附加 JSON 可展开阅读，字符串按文本转义且金额不改写', async () => {
    const user = userEvent.setup();
    const fields = {
      source: 'Funding',
      amount: '-0.0000012300',
      note: '<img src="x" onerror="alert(1)"><script>alert(1)</script>',
    };
    const { container } = render(<JsonDetails title="官方附加来源" value={fields} />);
    await user.click(screen.getByText('官方附加来源'));

    const preview = container.querySelector('pre');
    expect(preview).toBeVisible();
    const text = preview?.textContent ?? '';
    expect(JSON.parse(text)).toEqual(fields);
    expect(text).toMatch(/\n\s+"/);
    expect(container.querySelector('img, script')).toBeNull();
  });

  it('超长附加字段只展示有界片段，并明确标注截断', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <JsonDetails
        title="来源附加字段"
        value={{ source: 'Funding', note: `可见开头${'x'.repeat(50_000)}不可见结尾` }}
      />,
    );
    await user.click(screen.getByText('来源附加字段'));

    const text = container.querySelector('pre')?.textContent ?? '';
    expect(text).toContain('Funding');
    expect(text).toContain('可见开头');
    expect(text.length).toBeLessThan(10_000);
    expect(text).not.toContain('不可见结尾');
    expect(screen.getByRole('note')).toHaveTextContent(/截断/);
  });

  it('不把完整网络错误对象当作公开附加 JSON 展示', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <JsonDetails title="附加诊断" value={new Error('私密网络错误与凭据明文')} />,
    );
    await user.click(screen.getByText('附加诊断'));

    expect(container).not.toHaveTextContent('私密网络错误与凭据明文');
    expect(container.querySelector('pre')).not.toHaveTextContent('stack');
  });
});
