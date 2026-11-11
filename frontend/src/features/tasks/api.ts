import { parseReadOutcome } from '@/lib/read-only/response';
import { uuidSchema } from '@/lib/read-only/schemas';
import type { RpcApi } from '@/services/api/rpc';
import { type TaskListSearch, taskDetailSchema, taskSearchSchema, tasksPageSchema } from './schemas';
import type { TaskDetailRequest, TasksRequest } from './types';

export function tasksQuery(search: TaskListSearch): TasksRequest['query'] {
  const valid = taskSearchSchema.parse(search);
  return { ...valid, page: String(valid.page), pageSize: String(valid.pageSize) };
}

export async function readTasks(rpc: RpcApi, search: TaskListSearch, signal: AbortSignal) {
  const query = tasksQuery(search);
  const outcome = await rpc.request((client) => client.api.v1.tasks.$get({ query }), { signal });
  return parseReadOutcome(outcome, tasksPageSchema);
}

export async function readTask(rpc: RpcApi, id: string, signal: AbortSignal) {
  const param: TaskDetailRequest['param'] = { id: uuidSchema.parse(id) };
  const outcome = await rpc.request((client) => client.api.v1.tasks[':id'].$get({ param }), { signal });
  return parseReadOutcome(outcome, taskDetailSchema);
}
