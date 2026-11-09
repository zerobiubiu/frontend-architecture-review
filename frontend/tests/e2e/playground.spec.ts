import { expect, type Page, test } from '@playwright/test';

const PLAYGROUND = '/dev/playground';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('Playground 启动、主题切换、图标与 Tailwind 生效', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto(PLAYGROUND);

  await expect(page.getByRole('heading', { name: 'Engineering Playground' })).toBeVisible();
  await expect(page.getByTestId('playground')).toBeVisible();
  expect(await page.getByTestId('icon-row').locator('svg').count()).toBeGreaterThan(2);

  const gridColumns = await page
    .getByTestId('tailwind-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(gridColumns.split(' ').length).toBe(3);

  await expect(page.locator('html')).toHaveAttribute('data-astryx-theme', 'binance-stocks');
  await page.getByRole('radio', { name: '深色' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/playground-dark.png' });

  await page.getByRole('radio', { name: '浅色' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: 'test-results/playground-light.png' });

  expect(errors).toEqual([]);
});

test('Dialog / AlertDialog / Drawer 可操作且焦点归还', async ({ page }) => {
  await page.goto(PLAYGROUND);

  const dialogTrigger = page.getByRole('button', { name: '打开 Dialog' });
  await dialogTrigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('示例 Dialog')).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(dialogTrigger).toBeFocused();

  await page.getByRole('button', { name: '打开 AlertDialog' }).click();
  const alert = page.getByRole('alertdialog');
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: '确认' }).click();
  await expect(page.getByText('已在本地确认（无后端调用）')).toBeVisible();

  await page.getByRole('button', { name: '打开 Drawer' }).click();
  const drawer = page.getByRole('dialog').filter({ hasText: '示例 Drawer' });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
});

test('Toast、DropdownMenu、Popover 可用', async ({ page }) => {
  await page.goto(PLAYGROUND);

  await page.getByRole('button', { name: '显示 Toast' }).click();
  await expect(page.getByText('这是一条演示 Toast').first()).toBeVisible();

  await page.getByRole('button', { name: '操作菜单' }).click();
  await expect(page.getByRole('menuitem', { name: /复制订单号/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /复制订单号/ }).click();

  await page.getByRole('button', { name: '打开 Popover' }).click();
  const popoverContent = page.getByText('这是 Popover 内容，支持点击外部关闭。');
  await expect(popoverContent).toBeVisible();
  await page.getByRole('heading', { name: 'Engineering Playground' }).click();
  await expect(popoverContent).toBeHidden();
});

test('RHF + Zod 表单保留金融字符串并展示字段错误', async ({ page }) => {
  await page.goto(PLAYGROUND);

  const price = page.getByTestId('rhf-form').getByRole('textbox', { name: '限价' });
  await price.fill('1.234');
  await page.getByRole('button', { name: '校验演示表单' }).click();
  await expect(page.getByText('限价最多两位小数').first()).toBeVisible();

  await price.fill('0.100000000000000001');
  await page.getByRole('button', { name: '校验演示表单' }).click();
  await expect(page.getByText('限价最多两位小数').first()).toBeVisible();
  await expect(price).toHaveValue('0.100000000000000001');

  await price.fill('123.45');
  const quantity = page.getByTestId('rhf-form').getByRole('textbox', { name: '股数' });
  await quantity.fill('10.123456789');
  await page.getByRole('combobox', { name: '证券' }).click();
  await page.getByRole('option', { name: 'AAPL · Apple' }).click();
  await page.getByRole('checkbox', { name: '我确认这只是演示表单' }).check();
  await page.getByRole('button', { name: '校验演示表单' }).click();

  const submitted = page.getByTestId('submitted-json');
  await expect(submitted).toBeVisible();
  await expect(submitted).toContainText('"price": "123.45"');
  await expect(submitted).toContainText('"quantity": "10.123456789"');
});

test('UtcDateTimeField 保留六位小数并显式处理 DST 重复时间', async ({ page }) => {
  await page.goto(PLAYGROUND);

  const utcInput = page.getByTestId('utc-datetime-input').first();
  await expect(utcInput).toHaveValue('2026-03-08T06:30:00.123456Z');
  await expect(page.getByTestId('utc-datetime-preview').first()).toContainText(
    '纽约 2026-03-08 01:30:00.123456',
  );

  await page.getByRole('button', { name: '七位小数（应报错）' }).click();
  await expect(page.getByText('小数秒最多六位').first()).toBeVisible();

  await page.getByRole('button', { name: '六位小数样例' }).click();
  await page.getByRole('radio', { name: '纽约时间' }).first().click();
  const nyInput = page.getByTestId('new-york-datetime-input').first();
  await nyInput.fill('2026-11-01 01:30:00');
  const ambiguous = page.getByTestId('dst-ambiguous');
  await expect(ambiguous).toBeVisible();
  await expect(ambiguous.getByRole('radio')).toHaveCount(2);
  await ambiguous.getByRole('radio').nth(1).click();
  await expect(page.getByText('2026-11-01T06:30:00Z')).toBeVisible();
});

test('DataTableShell 分页、排序、列可见性', async ({ page }) => {
  await page.goto(PLAYGROUND);

  const shell = page.getByTestId('data-table-shell');
  await expect(shell.getByRole('cell', { name: 'DEMO-0001' })).toBeVisible();
  await shell.getByRole('button', { name: '转到下一页' }).click();
  await expect(shell.getByRole('cell', { name: 'DEMO-0011' })).toBeVisible();

  await shell.getByRole('button', { name: '订单号' }).click();
  await expect(shell.getByRole('columnheader', { name: '订单号' })).toHaveAttribute('aria-sort', 'ascending');

  await shell.getByRole('button', { name: '列' }).click();
  await shell.getByRole('menuitemcheckbox', { name: '方向' }).click();
  await expect(shell.getByRole('columnheader', { name: '方向' })).toHaveCount(0);
});

test('响应式布局与移动端截图', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PLAYGROUND);
  await expect(page.getByRole('heading', { name: 'Engineering Playground' })).toBeVisible();

  const columns = await page
    .getByTestId('tailwind-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(columns.split(' ').length).toBe(1);
  await page.screenshot({ path: 'test-results/playground-mobile.png', fullPage: false });
  expect(errors).toEqual([]);
});
