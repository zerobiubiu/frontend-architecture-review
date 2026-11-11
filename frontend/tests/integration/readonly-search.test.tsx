import { filterSchema } from '@project/api-contracts/validation';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FilterBar } from '@/components/read-only/filters';
import { useReadSearch } from '@/lib/read-only/search';

const ACCOUNT_A = '10000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '10000000-0000-4000-8000-000000000002';
const searchSchema = filterSchema.pick({ accountId: true, search: true, page: true, pageSize: true });
const fields = [
  { name: 'accountId', label: '账户范围' },
  { name: 'search', label: '名称关键词' },
];
const histories: Array<ReturnType<typeof createMemoryHistory>> = [];

function SearchConsumer() {
  const state = useReadSearch(searchSchema);
  return (
    <>
      <FilterBar
        fields={fields}
        values={{ accountId: state.search.accountId ?? '', search: state.search.search ?? '' }}
        onApply={state.apply}
        onReset={state.reset}
      />
      {state.error ? <p role="alert">{state.error}</p> : null}
      <output aria-label="当前页">{state.search.page}</output>
      <output aria-label="每页条数">{state.search.pageSize}</output>
      <output aria-label="已应用账户">{state.search.accountId ?? '未选择'}</output>
      <button type="button" onClick={() => state.setPage(3)}>
        转到第三页
      </button>
      <button type="button" onClick={() => state.setPageSize(50)}>
        每页五十条
      </button>
    </>
  );
}

async function mount(href: string) {
  const history = createMemoryHistory({ initialEntries: [href] });
  histories.push(history);
  const root = createRootRoute({ component: SearchConsumer });
  const router = createRouter({ routeTree: root, history, defaultPendingMs: 0, defaultPendingMinMs: 0 });
  await router.load();
  render(<RouterProvider router={router} />);
  return history;
}

afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
});

describe('可分享筛选与单一分页拥有者', () => {
  it('修改账户应用筛选回第一页，页长变化也重置，后退恢复先前URL状态', async () => {
    const user = userEvent.setup();
    const history = await mount(`/?accountId=${ACCOUNT_A}&page=4&pageSize=25&search=old`);
    expect(screen.getByLabelText('当前页')).toHaveTextContent('4');
    const account = screen.getByRole('textbox', { name: '账户范围' });
    await user.clear(account);
    await user.type(account, ACCOUNT_B);
    // 草稿不触发分页或查询条件变化。
    expect(screen.getByLabelText('已应用账户')).toHaveTextContent(ACCOUNT_A);
    await user.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() => expect(screen.getByLabelText('当前页')).toHaveTextContent('1'));
    expect(screen.getByLabelText('已应用账户')).toHaveTextContent(ACCOUNT_B);
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('accountId')).toBe(ACCOUNT_B);
    await user.click(screen.getByRole('button', { name: '转到第三页' }));
    await waitFor(() => expect(screen.getByLabelText('当前页')).toHaveTextContent('3'));
    await user.click(screen.getByRole('button', { name: '每页五十条' }));
    await waitFor(() => expect(screen.getByLabelText('每页条数')).toHaveTextContent('50'));
    expect(screen.getByLabelText('当前页')).toHaveTextContent('1');
    history.back();
    await waitFor(() => expect(screen.getByLabelText('当前页')).toHaveTextContent('3'));
    expect(screen.getByLabelText('每页条数')).toHaveTextContent('25');
  });

  it('非法地址和非法新条件不会伪装已应用，重置清除错误及账户范围', async () => {
    const user = userEvent.setup();
    const history = await mount(`/?accountId=${ACCOUNT_A}&page=0`);
    expect(screen.getByRole('alert')).toHaveTextContent('参数无效');
    const original = history.location.href;
    await user.type(screen.getByRole('textbox', { name: '账户范围' }), 'not-a-uuid');
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(history.location.href).toBe(original);
    await user.click(screen.getByRole('button', { name: '重置' }));
    await waitFor(() => expect(screen.queryByText(/地址中的筛选或分页参数无效/)).not.toBeInTheDocument());
    expect(screen.getByLabelText('已应用账户')).toHaveTextContent('未选择');
    expect(screen.getByLabelText('当前页')).toHaveTextContent('1');
  });
});
