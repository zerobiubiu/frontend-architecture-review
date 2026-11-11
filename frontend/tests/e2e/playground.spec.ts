import { expect, type Locator, type Page, test } from '@playwright/test';

const PLAYGROUND = '/dev/playground';

async function selectSymbol(page: Page, form: Locator) {
  await form.getByRole('combobox', { name: '证券' }).click();
  await expect(page.getByRole('option', { name: 'AAPL · Apple' })).toBeVisible();
  // Astryx Selector 的弹层在并发/动画下点击稳定性较差；用键盘选择验证同一受控路径。
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
}

function collectUncaughtErrors(page: Page): string[] {
  const errors: string[] = [];
  // 匿名会话恢复允许正常的 HTTP 401；组件冒烟只断言未捕获的脚本异常，
  // HTTP 错误的界面语义由认证协议浏览器用例单独覆盖。
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function clickVisibleMenuItem(page: Page, item: Locator): Promise<void> {
  await expect(item).toBeVisible();
  await expect(item).toBeInViewport({ ratio: 1 });
  // 本机 Chrome 的锚定菜单会被 scrollIntoView 滚走；校验真实命中点后发送原生鼠标事件，不 force 或改 DOM。
  const point = await item.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    return { x, y, hitsItem: element.contains(document.elementFromPoint(x, y)) };
  });
  expect(point.hitsItem).toBe(true);
  await page.mouse.click(point.x, point.y);
}

test('Playground 启动、主题切换、图标与 Tailwind 生效', async ({ page }) => {
  const errors = collectUncaughtErrors(page);
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
  await clickVisibleMenuItem(page, page.getByRole('menuitem', { name: /复制订单号/ }));

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
  await selectSymbol(page, page.getByTestId('rhf-form'));
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
  const direction = shell.getByRole('menuitemcheckbox', { name: '方向' });
  await clickVisibleMenuItem(page, direction);
  await expect(shell.getByRole('columnheader', { name: '方向' })).toHaveCount(0);
});

test('响应式布局与移动端截图', async ({ page }) => {
  const errors = collectUncaughtErrors(page);
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

test('显式主题覆盖系统偏好，并同步到 Card / 输入框 / Portal', async ({ page }) => {
  interface Snapshot {
    colorScheme: string;
    rootBg: string;
    cardBg: string;
    inputColor: string;
    inputBorder: string;
  }

  async function snapshot(): Promise<Snapshot> {
    return page.evaluate(() => {
      const root = document.querySelector('.bg-body');
      const card = document.querySelector('.astryx-card');
      const input = document.querySelector('input[type="text"]');
      if (!root || !card || !input) throw new Error('theme probe elements missing');
      const cardStyle = getComputedStyle(card);
      const inputStyle = getComputedStyle(input);
      return {
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        rootBg: getComputedStyle(root).backgroundColor,
        cardBg: cardStyle.backgroundColor,
        inputColor: inputStyle.color,
        inputBorder: inputStyle.borderColor,
      };
    });
  }

  async function applyMode(system: 'light' | 'dark', mode: '浅色' | '深色' | '跟随系统') {
    await page.emulateMedia({ colorScheme: system });
    await page.goto(PLAYGROUND);
    await page
      .locator('header')
      .getByRole('radiogroup', { name: '主题模式' })
      .getByRole('radio', { name: mode })
      .click();
    await page.waitForTimeout(50);
    return snapshot();
  }

  const lightOnLight = await applyMode('light', '浅色');
  const darkOnLight = await applyMode('light', '深色');
  const lightOnDark = await applyMode('dark', '浅色');
  const darkOnDark = await applyMode('dark', '深色');

  expect(lightOnLight.colorScheme).toBe('light');
  expect(darkOnLight.colorScheme).toBe('dark');
  expect(lightOnDark.colorScheme).toBe('light');
  expect(darkOnDark.colorScheme).toBe('dark');

  expect(darkOnLight.rootBg).not.toBe(lightOnLight.rootBg);
  expect(darkOnLight.rootBg).toBe(darkOnDark.rootBg);
  expect(lightOnDark.rootBg).toBe(lightOnLight.rootBg);
  expect(darkOnLight.cardBg).toBe(darkOnDark.cardBg);
  expect(darkOnLight.inputColor).toBe(darkOnDark.inputColor);
  expect(lightOnDark.inputColor).toBe(lightOnLight.inputColor);
  expect(darkOnLight.inputBorder).toBe(darkOnDark.inputBorder);

  // 系统模式仍随系统偏好变化，但不强制 data-theme。
  const systemLight = await applyMode('light', '跟随系统');
  const systemDark = await applyMode('dark', '跟随系统');
  expect(systemLight.colorScheme).toBe('light dark');
  expect(systemDark.colorScheme).toBe('light dark');
  expect(systemLight.rootBg).toBe(lightOnLight.rootBg);
  expect(systemDark.rootBg).toBe(darkOnDark.rootBg);

  async function portalColor(system: 'light' | 'dark', mode: '浅色' | '深色') {
    await applyMode(system, mode);
    await page.getByRole('button', { name: '打开 Dialog' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const color = await dialog.evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.getByRole('button', { name: '取消' }).click();
    return color;
  }

  const dialogLight = await portalColor('dark', '浅色');
  const dialogLightOnLightSystem = await portalColor('light', '浅色');
  const dialogDark = await portalColor('light', '深色');
  expect(dialogLightOnLightSystem).toBe(dialogLight);
  expect(dialogLight).not.toBe(dialogDark);

  async function drawerColor(system: 'light' | 'dark', mode: '浅色' | '深色') {
    await applyMode(system, mode);
    await page.getByRole('button', { name: '打开 Drawer' }).click();
    const drawer = page.getByRole('dialog').filter({ hasText: '示例 Drawer' });
    await expect(drawer).toBeVisible();
    const color = await drawer.evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.keyboard.press('Escape');
    return color;
  }

  const drawerLight = await drawerColor('light', '浅色');
  const drawerDark = await drawerColor('light', '深色');
  expect(drawerLight).not.toBe(drawerDark);

  async function toastColor(system: 'light' | 'dark', mode: '浅色' | '深色') {
    await applyMode(system, mode);
    await page.getByRole('button', { name: '显示 Toast' }).click();
    const toast = page.locator('[class*="astryx-toast"]').first();
    await expect(toast).toBeVisible();
    return toast.evaluate((element) => getComputedStyle(element).backgroundColor);
  }

  const toastLight = await toastColor('light', '浅色');
  const toastDark = await toastColor('dark', '深色');
  expect(toastLight).not.toBe(toastDark);
  expect(toastDark).not.toBe('rgba(0, 0, 0, 0)');
});

test('纽约草稿无效/未消歧时 RHF 提交被阻止，修复后可提交', async ({ page }) => {
  await page.goto(PLAYGROUND);
  const form = page.getByTestId('rhf-form');

  await form.getByRole('textbox', { name: '限价' }).fill('123.45');
  await form.getByRole('textbox', { name: '股数' }).fill('10');
  await selectSymbol(page, form);
  await form.getByRole('checkbox', { name: '我确认这只是演示表单' }).check();
  await form.getByRole('radio', { name: '纽约时间' }).click();

  const nyInput = form.getByTestId('new-york-datetime-input');
  await nyInput.fill('2026-03-08 02:30:00');
  await expect(form.getByText(/DST 跳变/).first()).toBeVisible();
  await form.getByRole('button', { name: '校验演示表单' }).click();
  await expect(page.getByTestId('submitted-json')).toHaveCount(0);
  await expect(form.getByText('计划开始存在未解决的输入错误').first()).toBeVisible();

  await nyInput.fill('2026-01-15 09:30:00');
  await expect(form.getByTestId('utc-datetime-preview')).toContainText('2026-01-15 14:30:00');
  await form.getByRole('button', { name: '校验演示表单' }).click();
  await expect(page.getByTestId('submitted-json')).toContainText('2026-01-15T14:30:00Z');
});

test('离线敏感写不排队，恢复网络也不自动发送', async ({ page, context }) => {
  await page.goto(PLAYGROUND);
  await context.setOffline(true);
  await page.getByRole('button', { name: '尝试敏感写（演示）' }).click();
  await expect(page.getByTestId('sensitive-write-state')).toHaveText('状态：blocked:offline');
  await expect(page.getByTestId('sensitive-write-attempts')).toHaveText('已发送：0');

  await context.setOffline(false);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('sensitive-write-attempts')).toHaveText('已发送：0');
  await expect(page.getByTestId('sensitive-write-state')).toHaveText('状态：blocked:offline');
});
