import { Button, Dialog, DialogHeader, TextInput } from '@astryxdesign/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { ThemeModeToggle } from '@/components/shared/theme-mode-toggle';

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button label="打开" onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onOpenChange={setOpen} width={360}>
        <DialogHeader title="测试对话框" />
        <TextInput label="对话框输入" value="" onChange={() => undefined} />
        <Button label="关闭" onClick={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

describe('主题与 Dialog（Portal / 键盘焦点）', () => {
  it('主题模式写入 documentElement，并同步 data-astryx-theme', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <ThemeModeToggle />
      </AppProviders>,
    );

    await waitFor(() => expect(document.documentElement.dataset.astryxTheme).toBe('binance-stocks'));
    // system 模式不强制 data-theme，由 reset.css 的 color-scheme: light dark 交给系统。
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();

    await user.click(screen.getByRole('radio', { name: '深色' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(localStorage.getItem('binance-stocks.theme-mode')).toBe('dark');

    await user.click(screen.getByRole('radio', { name: '浅色' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });

  it('Dialog 打开后进入 Portal，Esc 关闭并归还焦点', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <DialogHarness />
      </AppProviders>,
    );

    const trigger = screen.getByRole('button', { name: '打开' });
    trigger.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '对话框输入' })).toBeInTheDocument();
    // Portal 渲染在 #root 之外，主题仍通过 documentElement 作用域生效。
    expect(document.getElementById('root')?.contains(dialog)).not.toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
