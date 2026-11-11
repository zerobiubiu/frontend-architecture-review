import type { ApiClient } from '@project/api-contracts';
import type { InferResponseType } from 'hono/client';
import type { AuthSessionData } from '@/features/auth/types';
import type { RpcApi } from '@/services/api/rpc';

// 由现有测试项目编译，不执行故意非法的调用；不能退化成任意路径/参数。
export function verifyRpcContract(client: ApiClient, rpc: RpcApi): void {
  client.api.v1.auth.login.$post({ json: { username: 'trader', password: ' password ' } });
  client.api.v1.accounts[':id'].$get({ param: { id: 'account-1' } });
  client.healthz.$get();
  const valid: InferResponseType<typeof client.api.v1.auth.me.$get>['data'] = {
    user: { id: 'id', username: 'user', role: 'TRADER', canManageAdmins: false },
    csrfToken: 'token',
  };
  const data: AuthSessionData = valid;
  void data;
  rpc
    .request((api) => api.api.v1.auth.me.$get())
    .then((outcome) => {
      if (outcome.kind === 'success') {
        const token: string = outcome.data.csrfToken;
        // @ts-expect-error 推导的 CSRF 不是金融或数字字段。
        const invalid: number = outcome.data.csrfToken;
        void token;
        void invalid;
      }
    });
  rpc
    .request((api) =>
      api.api.v1.orders.$get({ query: { accountId: 'account-1', page: '1', pageSize: '25' } }),
    )
    .then((outcome) => {
      if (outcome.kind === 'success') {
        const quantity: string | undefined = outcome.data.items[0]?.filledQuantity;
        // @ts-expect-error 金融数量没有退化为 number 或 any。
        const invalid: number | undefined = outcome.data.items[0]?.filledQuantity;
        void quantity;
        void invalid;
      }
    });
  rpc
    .request((api) => api.api.v1.accounts[':id'].$get({ param: { id: 'account-1' } }))
    .then((outcome) => {
      if (outcome.kind === 'success') {
        const cash: string | null = outcome.data.availableCash;
        // @ts-expect-error 未知余额不能由 DTO 类型悄悄变成数字零。
        const invalid: number = outcome.data.availableCash;
        void cash;
        void invalid;
      }
    });
  // @ts-expect-error 查询接口没有声明 sort 参数。
  client.api.v1.orders.$get({ query: { sort: 'price' } });
  // @ts-expect-error 不存在的公开路由。
  client.api.v1.auth.notARealEndpoint.$get();
  // @ts-expect-error login 缺必填参数。
  client.api.v1.auth.login.$post();
  // @ts-expect-error 密码必填。
  client.api.v1.auth.login.$post({ json: { username: 'trader' } });
  // @ts-expect-error 用户名必须是字符串。
  client.api.v1.auth.login.$post({ json: { username: 12, password: 'password' } });
  // @ts-expect-error 路径参数必填。
  client.api.v1.accounts[':id'].$get();
  // @ts-expect-error 真实参数名为 id。
  client.api.v1.accounts[':id'].$get({ param: { accountId: 'account-1' } });
}
