import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { readOverview } from '@/features/dashboard/api';
import { ReadContractError } from '@/lib/read-only/response';
import { createRpcApi } from '@/services/api/rpc';
import { API } from '../msw/handlers';
import { dashboardFixture } from '../msw/readonly/dashboard';
import { server } from '../msw/server';

const rpc = createRpcApi({ baseUrl: API, getSessionEpoch: () => 9 });

describe('真实角色范围概览契约', () => {
  it('缺失心跳和未计算名义金额保留未知，不填1970或零值', async () => {
    const data = dashboardFixture();
    server.use(
      http.get(`${API}/overview`, () =>
        HttpResponse.json({
          data: {
            ...data,
            today: { ...data.today, buyAmount: null, sellAmount: null, quoteCurrency: null },
            worker: { online: false, lastSeenAt: null, status: 'UNKNOWN' },
          },
        }),
      ),
    );
    const result = await readOverview(rpc, new AbortController().signal);
    expect(result.worker.lastSeenAt).toBeNull();
    expect(result.today.buyAmount).toBeNull();
    expect(result.today.quoteCurrency).toBeNull();
    expect(result.today.cashFlowVerified).toBe(false);
  });

  it('数字金融值不能借静态DTO混入展示，错误只包含字段路径', async () => {
    const data = dashboardFixture();
    server.use(
      http.get(`${API}/overview`, () =>
        HttpResponse.json({
          data: {
            ...data,
            today: { ...data.today, buyAmount: 123.45 },
            privateUnexpected: 'not-for-error-output',
          },
        }),
      ),
    );
    const result = readOverview(rpc, new AbortController().signal);
    await expect(result).rejects.toBeInstanceOf(ReadContractError);
    await expect(result).rejects.not.toThrow('not-for-error-output');
  });

  it('不能把名义额响应宣称现金流已核实', async () => {
    const data = dashboardFixture();
    server.use(
      http.get(`${API}/overview`, () =>
        HttpResponse.json({ data: { ...data, today: { ...data.today, cashFlowVerified: true } } }),
      ),
    );
    await expect(readOverview(rpc, new AbortController().signal)).rejects.toBeInstanceOf(ReadContractError);
  });
});
