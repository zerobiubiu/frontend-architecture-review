import { roles } from '@project/api-contracts/validation';
import { z } from 'zod';
import type { RpcApi } from '@/services/api/rpc';
import type { ApiOutcome } from '@/services/api/types';
import type { AuthApi, AuthSessionData, LogoutData } from './types';

// 公开模块没有身份响应 Schema，只校验本阶段实际消费的安全字段，不补造权限或 token。
const sessionSchema = z.object({
  user: z
    .object({
      id: z.uuid(),
      username: z.string().min(1).max(64),
      role: z.enum(roles),
      canManageAdmins: z.boolean(),
    })
    .refine((user) => user.role === 'ADMIN' || !user.canManageAdmins),
  csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
const logoutSchema = z.object({ loggedOut: z.literal(true) });

function validateData<T>(outcome: ApiOutcome<T>, schema: z.ZodType<T>): ApiOutcome<T> {
  if (outcome.kind !== 'success') return outcome;
  const parsed = schema.safeParse(outcome.data);
  if (parsed.success) return { ...outcome, data: parsed.data };
  return {
    kind: 'malformed',
    status: outcome.status,
    message: '认证响应缺少可信身份、权限或会话字段',
    body: null,
    receipt: outcome.receipt,
    sessionEpoch: outcome.sessionEpoch,
  };
}

export function createAuthApi(rpc: RpcApi): AuthApi {
  return {
    login: async (input, signal) =>
      validateData<AuthSessionData>(
        await rpc.request((client) => client.api.v1.auth.login.$post({ json: input }), {
          sessionBound: false,
          signal,
          csrfToken: null,
        }),
        sessionSchema,
      ),
    me: async (signal) =>
      validateData<AuthSessionData>(
        await rpc.request((client) => client.api.v1.auth.me.$get(), { sessionBound: false, signal }),
        sessionSchema,
      ),
    logout: async (csrfToken, signal) =>
      validateData<LogoutData>(
        await rpc.request((client) => client.api.v1.auth.logout.$post(), {
          sessionBound: false,
          signal,
          csrfToken,
        }),
        logoutSchema,
      ),
  };
}
