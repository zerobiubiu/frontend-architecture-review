import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';
import type { ApiOutcome } from '@/services/api/types';

type AuthClient = ApiClient['api']['v1']['auth'];
export type LoginInput = InferRequestType<AuthClient['login']['$post']>['json'];
export type AuthSessionData = InferResponseType<AuthClient['me']['$get']>['data'];
export type AuthUser = AuthSessionData['user'];
export type LogoutData = InferResponseType<AuthClient['logout']['$post']>['data'];

export interface AuthApi {
  login(input: LoginInput, signal?: AbortSignal): Promise<ApiOutcome<AuthSessionData>>;
  me(signal?: AbortSignal): Promise<ApiOutcome<AuthSessionData>>;
  logout(csrfToken: string, signal?: AbortSignal): Promise<ApiOutcome<LogoutData>>;
}
