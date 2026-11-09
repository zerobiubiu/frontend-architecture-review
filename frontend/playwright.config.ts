import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

// 使用本机已安装的 Chrome（channel: 'chrome'），不强制下载 Playwright 浏览器。
// CI 中可用 PLAYWRIGHT_CHANNEL=chromium + `bun run e2e:install` 切换。
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel,
      },
    },
  ],
  webServer: {
    command: `bun run dev --port ${PORT} --strictPort`,
    url: BASE_URL,
    // 已手动启动 dev server 时直接复用；端口空时自动拉起。
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
