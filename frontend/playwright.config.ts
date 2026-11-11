import { defineConfig, devices } from '@playwright/test';
import { DEVELOPMENT_ORIGIN, DEVELOPMENT_PORT } from './tests/protocol/control.js';

const PORT = DEVELOPMENT_PORT;
const BASE_URL = DEVELOPMENT_ORIGIN;
const PROTOCOL_URL = 'http://localhost:18770';
const PREVIEW_URL = 'http://localhost:4173';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

// 使用本机已安装的 Chrome（channel: 'chrome'），不强制下载 Playwright 浏览器。
// CI 中可用 PLAYWRIGHT_CHANNEL=chromium + `bun run e2e:install` 切换。
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './tests/e2e',
  // 协议桩的故障模式与闸门是进程内状态，浏览器用例依次拥有它，避免跨用例相互改写。
  fullyParallel: false,
  workers: 1,
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
  webServer: [
    {
      command: 'bun tests/protocol/server.mjs',
      url: `${PROTOCOL_URL}/__stub/healthz`,
      env: { PROTOCOL_STUB: '1' },
      reuseExistingServer,
      timeout: 30_000,
    },
    {
      command: `bun run dev --host localhost --port ${PORT} --strictPort`,
      url: BASE_URL,
      // 仅传给开发子进程；不污染父进程、生产构建或正式 API 配置。
      env: {
        VITE_API_BASE_URL: `${PROTOCOL_URL}/api/v1`,
        VITE_PROTOCOL_STUB: '1',
      },
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      // 验收者先执行 bun run build；这里不隐式重建或注入 Mock 构建变量。
      command: 'bun run preview --host localhost --port 4173 --strictPort',
      url: PREVIEW_URL,
      reuseExistingServer,
      timeout: 30_000,
    },
  ],
});
