import type { ApiClient } from '@project/api-contracts';
import type { InferResponseType } from 'hono/client';

type AuthSessionData = InferResponseType<ApiClient['api']['v1']['auth']['me']['$get']>['data'];
type AuthUser = AuthSessionData['user'];

export const TRADER_USER = {
  id: '00000000-0000-4000-8000-000000000011',
  username: 'trader',
  role: 'TRADER',
  canManageAdmins: false,
} as const satisfies AuthUser;
export const ADMIN_USER = {
  id: '00000000-0000-4000-8000-000000000012',
  username: 'admin',
  role: 'ADMIN',
  canManageAdmins: false,
} as const satisfies AuthUser;
export const OWNER_USER = {
  id: '00000000-0000-4000-8000-000000000013',
  username: 'owner',
  role: 'ADMIN',
  canManageAdmins: true,
} as const satisfies AuthUser;
export const AUTH_DATA = { user: TRADER_USER, csrfToken: 't'.repeat(43) } satisfies AuthSessionData;
