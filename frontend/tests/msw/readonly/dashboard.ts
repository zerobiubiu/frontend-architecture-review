import type { OverviewDto } from '@/features/dashboard/schemas';

// 只供自动化协议验收；不导入任何生产运行代码，不代表真实后端/账户数据。
export function dashboardFixture(): OverviewDto {
  return {
    account: null,
    recordSource: 'LOCAL_LEDGER',
    assetsAvailable: false,
    assetMessage: 'Mock：尚无当前官方资金快照',
    counts: { runningTasks: 1, openOrders: 2, positions: 1, recoveryRequired: 1 },
    today: {
      buyQuantity: '1.1234567890',
      sellQuantity: '0',
      buyAmount: '123.456789012345678900',
      sellAmount: '0',
      quoteCurrency: 'USD',
      source: 'LOCAL_TRADE_NOTIONAL',
      cashFlowVerified: false,
    },
    recentOrders: [],
    issues: [],
    worker: { online: false, lastSeenAt: '2026-11-11T00:00:00Z', status: 'UNKNOWN' },
    environment: {
      environment: 'production',
      label: '正式交易',
      tradingReady: true,
      availability: 'AVAILABLE',
      buySupported: true,
      sellSupported: true,
      capabilities: { quotes: true, orders: true, trades: true, assets: true, buy: true, sell: true },
      blockers: [],
      apiVersion: '3.0.0',
    },
  };
}
