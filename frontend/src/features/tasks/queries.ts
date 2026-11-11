import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { uuidSchema } from '@/lib/read-only/schemas';
import { readTask, readTasks } from './api';
import { taskKeys } from './query-keys';
import type { TaskListSearch } from './schemas';

const canReadTasks = (user: AuthUser) => hasCapability(user, 'workspace');
const LIST_DEPENDENCIES = ['events'] as const;
const DETAIL_DEPENDENCIES = ['orders', 'ledger', 'events'] as const;

export function useTasksList(search: TaskListSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: taskKeys.list(scope, search),
    resource: 'tasks',
    dependencies: LIST_DEPENDENCIES,
    accountId: search.accountId ?? null,
    canRead: canReadTasks,
    enabled,
    queryFn: (signal) => readTasks(rpc, search, signal),
  });
}

export function useTaskDetail(id: string | undefined) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  const validId = uuidSchema.safeParse(id);
  const keyId = validId.success ? validId.data : null;
  return useResourceQuery({
    queryKey: taskKeys.detail(scope, keyId),
    resource: 'tasks',
    dependencies: DETAIL_DEPENDENCIES,
    accountId: null,
    canRead: canReadTasks,
    enabled: keyId !== null,
    queryFn: (signal) => readTask(rpc, keyId ?? '', signal),
  });
}
