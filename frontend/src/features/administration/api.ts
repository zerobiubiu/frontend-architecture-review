import { parseReadOutcome, ReadContractError } from '@/lib/read-only/response';
import { ApiOutcomeError } from '@/services/api/errors';
import type { RpcApi } from '@/services/api/rpc';
import type { ApiOutcome } from '@/services/api/types';
import {
  type AuditSearch,
  adminAuditSchema,
  adminOverviewSchema,
  adminSystemSchema,
  adminUsersSchema,
  healthSchema,
  type UsersSearch,
} from './schemas';
import type {
  AdminAuditDto,
  AdminAuditRequest,
  AdminOverviewView,
  AdminSystemView,
  AdminUsersDto,
  AdminUsersRequest,
  HealthRead,
} from './types';

export async function readAdminOverview(rpc: RpcApi, signal: AbortSignal): Promise<AdminOverviewView> {
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.admin.overview.$get(), { signal }),
    adminOverviewSchema,
  );
}

export async function readAdminUsers(
  rpc: RpcApi,
  search: UsersSearch,
  signal: AbortSignal,
): Promise<AdminUsersDto> {
  const query = {
    ...search,
    page: String(search.page),
    pageSize: String(search.pageSize),
  } satisfies AdminUsersRequest;
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.admin.users.$get({ query }), { signal }),
    adminUsersSchema,
  );
}

export async function readAdminAudit(
  rpc: RpcApi,
  search: AuditSearch,
  signal: AbortSignal,
): Promise<AdminAuditDto> {
  const query = {
    ...search,
    page: String(search.page),
    pageSize: String(search.pageSize),
  } satisfies AdminAuditRequest;
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.admin.audit.$get({ query }), { signal }),
    adminAuditSchema,
  );
}

export async function readAdminSystem(rpc: RpcApi, signal: AbortSignal): Promise<AdminSystemView> {
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.admin.system.$get(), { signal }),
    adminSystemSchema,
  );
}

/** /healthz 独有：503 + data 是降级证据，不转换为通用业务 success。 */
export function parseHealthOutcome(outcome: ApiOutcome<unknown>): HealthRead {
  if (
    !(
      (outcome.kind === 'success' && outcome.status === 200) ||
      (outcome.kind === 'http-data' && outcome.status === 503)
    )
  ) {
    throw new ApiOutcomeError(outcome);
  }
  const parsed = healthSchema.safeParse(outcome.data);
  if (!parsed.success) {
    throw new ReadContractError(parsed.error.issues.slice(0, 5).map((issue) => issue.path.join('.')));
  }
  if ((outcome.status === 200) !== (parsed.data.status === 'ok')) {
    throw new ReadContractError(['status']);
  }
  return { httpStatus: outcome.status, health: parsed.data };
}

export async function readAdminHealth(rpc: RpcApi, signal: AbortSignal): Promise<HealthRead> {
  return parseHealthOutcome(await rpc.request((client) => client.healthz.$get(), { signal }));
}
