import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionQueryKey } from '@/app/business-sync/query-convergence';
import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { AppProviders } from '@/app/providers/app-providers';
import { type AppServices, createAppServices } from '@/app/runtime';
import { QuerySurface } from '@/components/read-only/query-surface';
import type { AuthApi, AuthSessionData } from '@/features/auth/types';
import { ApiOutcomeError } from '@/services/api/errors';
import type { ApiOutcome } from '@/services/api/types';
import type { BusinessEventSource } from '@/services/realtime/manager';
import { AUTH_DATA } from '../msw/auth-fixtures';

const ACCOUNT_A = '10000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '10000000-0000-4000-8000-000000000002';
const canRead = () => true;
const disposables: AppServices[] = [];

function success<T>(data: T): ApiOutcome<T> {
  return {
    kind: 'success',
    status: 200,
    data,
    receipt: { kind: 'absent' },
    requestId: 'readonly-query-test',
    sessionEpoch: 0,
  };
}

function deferred<T>() {
  let complete: (value: T) => void = () => {
    throw new Error('Promise 尚未创建');
  };
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: (value: T) => complete(value) };
}

class Source implements BusinessEventSource {
  onopen: BusinessEventSource['onopen'] = null;
  onmessage: BusinessEventSource['onmessage'] = null;
  onerror: BusinessEventSource['onerror'] = null;
  closed = false;
  close() {
    this.closed = true;
  }
}

function services(me: AuthApi['me'] = async () => success(AUTH_DATA)) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  const runtime = createAppServices({
    queryClient,
    authApi: {
      me,
      login: async () => success(AUTH_DATA),
      logout: async () => success({ loggedOut: true as const }),
    },
    broadcastFactory: () => null,
    createEventSource: () => new Source(),
  });
  disposables.push(runtime);
  return runtime;
}

function Probe({
  accountId,
  read,
}: {
  accountId: string;
  read: (account: string, signal: AbortSignal) => Promise<string>;
}) {
  const scope = useQueryScope();
  const query = useResourceQuery({
    queryKey: sessionQueryKey(scope, 'orders', accountId, 'hook-probe'),
    resource: 'orders',
    accountId,
    canRead,
    queryFn: (signal) => read(accountId, signal),
  });
  return (
    <QuerySurface query={query}>{(data) => <output aria-label="当前账户记录">{data}</output>}</QuerySurface>
  );
}

async function tick(milliseconds = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  for (const runtime of disposables.splice(0)) {
    runtime.businessSync.stop();
    runtime.session.stop();
    runtime.queryClient.clear();
  }
  vi.useRealTimers();
});

describe('只读 Query 的真实会话/账户消费者边界', () => {
  it('身份核对未完成前不读取，确认后才展示该用户授权结果', async () => {
    const pending = deferred<ApiOutcome<AuthSessionData>>();
    const runtime = services(() => pending.promise);
    const read = vi.fn(async () => '已确认账户记录');
    render(
      <AppProviders services={runtime}>
        <Probe accountId={ACCOUNT_A} read={read} />
      </AppProviders>,
    );
    await tick();
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('当前账户记录')).not.toBeInTheDocument();
    pending.resolve(success(AUTH_DATA));
    await tick();
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('当前账户记录')).toHaveTextContent('已确认账户记录');
  });

  it('账户切换立即移除旧数据并取消旧读取，迟到成功不能覆盖新账户', async () => {
    const pendingA = deferred<string>();
    const pendingB = deferred<string>();
    const signals = new Map<string, AbortSignal>();
    const runtime = services();
    const read = vi.fn((account: string, signal: AbortSignal) => {
      signals.set(account, signal);
      return account === ACCOUNT_A ? pendingA.promise : pendingB.promise;
    });
    const view = render(
      <AppProviders services={runtime}>
        <Probe accountId={ACCOUNT_A} read={read} />
      </AppProviders>,
    );
    await tick();
    expect(read).toHaveBeenCalledTimes(1);
    view.rerender(
      <AppProviders services={runtime}>
        <Probe accountId={ACCOUNT_B} read={read} />
      </AppProviders>,
    );
    await tick();
    expect(signals.get(ACCOUNT_A)?.aborted).toBe(true);
    expect(screen.queryByLabelText('当前账户记录')).not.toBeInTheDocument();
    pendingB.resolve('账户乙的授权记录');
    await tick();
    pendingA.resolve('迟到的账户甲记录');
    await tick();
    expect(screen.getByLabelText('当前账户记录')).toHaveTextContent('账户乙的授权记录');
    expect(screen.queryByText('迟到的账户甲记录')).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('权限拒绝隐藏旧数据并停止自动收敛，只有显式核对成功后恢复', async () => {
    let allowed = true;
    let value = '旧的已授权记录';
    const runtime = services();
    const read = vi.fn(async () => {
      if (!allowed)
        throw new ApiOutcomeError({
          kind: 'http-error',
          status: 403,
          error: { code: 'FORBIDDEN', message: '读取权限已撤销', requestId: 'readonly-denied' },
          receipt: { kind: 'absent' },
          sessionEpoch: runtime.session.getSnapshot().epoch,
        });
      return value;
    });
    render(
      <AppProviders services={runtime}>
        <Probe accountId={ACCOUNT_A} read={read} />
      </AppProviders>,
    );
    await tick();
    expect(screen.getByLabelText('当前账户记录')).toHaveTextContent(value);
    allowed = false;
    runtime.convergence.refresh(['orders']);
    await tick(30);
    expect(screen.queryByLabelText('当前账户记录')).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
    runtime.convergence.refresh(['orders']);
    await tick(60_030);
    expect(read).toHaveBeenCalledTimes(2);
    allowed = true;
    value = '重新核对后的授权记录';
    fireEvent.click(screen.getByRole('button', { name: '重新核对访问权限' }));
    await tick();
    expect(screen.getByLabelText('当前账户记录')).toHaveTextContent(value);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it('拒绝后核对遇网络失败或重新挂载，均不能复活缓存或恢复自动读取', async () => {
    const runtime = services();
    let mode: 'authorized' | 'forbidden' | 'offline' = 'authorized';
    let value = '撤权前的敏感记录';
    const read = vi.fn(async () => {
      if (mode === 'forbidden')
        throw new ApiOutcomeError({
          kind: 'http-error',
          status: 403,
          error: { code: 'FORBIDDEN', message: '读取权限已撤销', requestId: 'readonly-denial-latch' },
          receipt: { kind: 'absent' },
          sessionEpoch: runtime.session.getSnapshot().epoch,
        });
      if (mode === 'offline') throw new Error('Mock 网络不可用');
      return value;
    });
    const view = render(
      <AppProviders services={runtime}>
        <Probe accountId={ACCOUNT_A} read={read} />
      </AppProviders>,
    );
    await tick();
    expect(screen.getByLabelText('当前账户记录')).toHaveTextContent(value);
    mode = 'forbidden';
    runtime.convergence.refresh(['orders']);
    await tick(30);
    expect(screen.queryByLabelText('当前账户记录')).not.toBeInTheDocument();
    mode = 'offline';
    fireEvent.click(screen.getByRole('button', { name: '重新核对访问权限' }));
    await tick();
    expect(read).toHaveBeenCalledTimes(3);
    expect(screen.queryByLabelText('当前账户记录')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新核对访问权限' })).toBeInTheDocument();
    runtime.convergence.refresh(['orders']);
    await tick(30);
    expect(read).toHaveBeenCalledTimes(3);
    view.rerender(<AppProviders services={runtime}>{null}</AppProviders>);
    await tick();
    view.rerender(
      <AppProviders services={runtime}>
        <Probe accountId={ACCOUNT_A} read={read} />
      </AppProviders>,
    );
    await tick();
    expect(read).toHaveBeenCalledTimes(3);
    expect(screen.queryByLabelText('当前账户记录')).not.toBeInTheDocument();
    mode = 'authorized';
    value = '重新授权后的当前记录';
    fireEvent.click(screen.getByRole('button', { name: '重新核对访问权限' }));
    await tick();
    expect(screen.getByLabelText('当前账户记录')).toHaveTextContent(value);
    expect(read).toHaveBeenCalledTimes(4);
    runtime.convergence.refresh(['orders']);
    await tick(30);
    expect(read).toHaveBeenCalledTimes(5);
  });
});
