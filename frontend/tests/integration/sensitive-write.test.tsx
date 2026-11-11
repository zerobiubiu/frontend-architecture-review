import { onlineManager, QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSensitiveMutationOptions,
  createSensitiveWriteGate,
  SensitiveWriteBlockedError,
  type SensitiveWriteContext,
} from '@/services/api/sensitive-write';

interface ContextState {
  online: boolean;
  epoch: number;
  accountId: string;
  validConfirmation: string;
}

function makeContext(state: ContextState): SensitiveWriteContext {
  return {
    isOnline: () => state.online,
    getSessionEpoch: () => state.epoch,
    getAccountId: () => state.accountId,
    isConfirmationCurrent: (id) => id === state.validConfirmation,
  };
}

function Harness({
  gate,
  mutationFn,
}: {
  readonly gate: ReturnType<typeof createSensitiveWriteGate>;
  readonly mutationFn: () => Promise<string>;
}) {
  const mutation = useMutation(
    createSensitiveMutationOptions({
      gate,
      intent: () => ({ confirmationId: 'confirm-1', expectedSessionEpoch: 1, expectedAccountId: 'acct-1' }),
      mutationFn,
    }),
  );
  return (
    <div>
      <button type="button" onClick={() => mutation.mutate()}>
        执行敏感写
      </button>
      <output data-testid="state">
        {mutation.isPending
          ? 'pending'
          : mutation.isError
            ? mutation.error instanceof SensitiveWriteBlockedError
              ? `blocked:${mutation.error.reason}`
              : `error:${mutation.error.message}`
            : 'idle'}
      </output>
    </div>
  );
}

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('敏感写 fail-fast 门禁', () => {
  it('离线触发不进入暂停队列，恢复网络后 Fetch 仍为 0 次', async () => {
    const user = userEvent.setup();
    const state: ContextState = {
      online: false,
      epoch: 1,
      accountId: 'acct-1',
      validConfirmation: 'confirm-1',
    };
    const gate = createSensitiveWriteGate(makeContext(state));
    const fetchSpy = vi.fn(() => Promise.resolve('sent'));

    onlineManager.setOnline(false);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness gate={gate} mutationFn={fetchSpy} />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: '执行敏感写' }));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('blocked:offline'));
    expect(fetchSpy).toHaveBeenCalledTimes(0);

    // 恢复网络不等于用户再次确认：不得自动发送。
    state.online = true;
    onlineManager.setOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(screen.getByTestId('state')).toHaveTextContent('blocked:offline');
  });

  it('发送前会话代次变化时阻止，且不调用 Fetch', async () => {
    const state: ContextState = {
      online: true,
      epoch: 2,
      accountId: 'acct-1',
      validConfirmation: 'confirm-1',
    };
    const gate = createSensitiveWriteGate(makeContext(state));
    const fetchSpy = vi.fn(() => Promise.resolve('sent'));
    await expect(
      gate.run(
        { confirmationId: 'confirm-1', expectedSessionEpoch: 1, expectedAccountId: 'acct-1' },
        fetchSpy,
      ),
    ).rejects.toMatchObject({ reason: 'session-changed' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('账户变化或确认失效时阻止；确认有效时只发送一次', async () => {
    const state: ContextState = {
      online: true,
      epoch: 1,
      accountId: 'acct-2',
      validConfirmation: 'confirm-1',
    };
    const gate = createSensitiveWriteGate(makeContext(state));
    const intent = { confirmationId: 'confirm-1', expectedSessionEpoch: 1, expectedAccountId: 'acct-1' };
    await expect(gate.run(intent, () => Promise.resolve('sent'))).rejects.toMatchObject({
      reason: 'account-changed',
    });

    state.accountId = 'acct-1';
    state.validConfirmation = 'other-confirmation';
    await expect(gate.run(intent, () => Promise.resolve('sent'))).rejects.toMatchObject({
      reason: 'confirmation-invalid',
    });

    state.validConfirmation = 'confirm-1';
    const send = vi.fn(() => Promise.resolve('sent'));
    await expect(gate.run(intent, send)).resolves.toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('门禁错误类型可被调用方区分', async () => {
    const state: ContextState = {
      online: false,
      epoch: 1,
      accountId: 'acct-1',
      validConfirmation: 'confirm-1',
    };
    const gate = createSensitiveWriteGate(makeContext(state));
    const error = await gate
      .run({ confirmationId: 'confirm-1', expectedSessionEpoch: 1, expectedAccountId: 'acct-1' }, () =>
        Promise.resolve('never'),
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SensitiveWriteBlockedError);
    expect((error as SensitiveWriteBlockedError).reason).toBe('offline');
  });
});
