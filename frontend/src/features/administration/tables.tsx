import { Text } from '@astryxdesign/core';
import { Link } from '@tanstack/react-router';
import type { ColumnDef, ColumnVisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { JsonDetails } from '@/components/read-only/object-details';
import { StatusValue, UtcValue } from '@/components/read-only/values';
import { DataTableShell, type tableFeatures } from '@/components/ui/data-table-shell';
import type { AdminAuditView, AdminUserView, EndpointView, HeartbeatView, SystemEventView } from './types';

export const USER_COLUMNS: ColumnDef<typeof tableFeatures, AdminUserView>[] = [
  {
    accessorKey: 'username',
    header: '用户名 / 用户 ID',
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          to="/administration/users/$id"
          params={{ id: row.original.id }}
          className="underline underline-offset-4"
        >
          {row.original.username}
        </Link>
        <span className="break-all text-secondary text-xs">{row.original.id}</span>
      </div>
    ),
  },
  { accessorKey: 'role', header: '角色', cell: ({ row }) => <StatusValue value={row.original.role} /> },
  {
    accessorKey: 'status',
    header: '用户状态',
    cell: ({ row }) => <StatusValue value={row.original.status} />,
  },
  {
    accessorKey: 'canManageAdmins',
    header: 'canManageAdmins',
    cell: ({ row }) => (row.original.canManageAdmins ? 'true（专项权限）' : 'false（无专项权限）'),
  },
  {
    accessorKey: 'createdAt',
    header: '创建时间（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
  },
  {
    accessorKey: 'updatedAt',
    header: '更新时间（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.updatedAt} />,
  },
  {
    id: 'accounts',
    header: '只读关联',
    cell: ({ row }) => (
      <Link
        to="/administration/accounts"
        search={{ ownerUserId: row.original.id }}
        className="underline underline-offset-4"
      >
        查看该用户账户
      </Link>
    ),
  },
];

export const AUDIT_COLUMNS: ColumnDef<typeof tableFeatures, AdminAuditView>[] = [
  {
    accessorKey: 'createdAt',
    header: '发生时间（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
  },
  {
    accessorKey: 'actorUserId',
    header: '发起者 / 角色',
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-1">
        {row.original.actorUserId ? (
          <Link
            to="/administration/users/$id"
            params={{ id: row.original.actorUserId }}
            className="break-all underline underline-offset-4"
          >
            {row.original.actorUserId}
          </Link>
        ) : (
          <span>无用户发起者</span>
        )}
        <StatusValue value={row.original.actorRole} />
      </div>
    ),
  },
  { accessorKey: 'action', header: '动作' },
  {
    accessorKey: 'targetId',
    header: '目标类型 / ID',
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-1">
        <span>{row.original.targetType}</span>
        <span className="break-all">{row.original.targetId ?? '无目标 ID'}</span>
      </div>
    ),
  },
  {
    accessorKey: 'result',
    header: '结果（非日志级别）',
    cell: ({ row }) => <StatusValue value={row.original.result} />,
  },
  {
    accessorKey: 'id',
    header: '审计 ID',
    cell: ({ row }) => <span className="break-all">{row.original.id}</span>,
  },
  {
    id: 'details',
    header: '公开附加字段',
    cell: ({ row }) => <JsonDetails value={row.original.details} title="审计附加字段" />,
  },
];

const EVENT_COLUMNS: ColumnDef<typeof tableFeatures, SystemEventView>[] = [
  {
    accessorKey: 'createdAt',
    header: '发生时间（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.createdAt} />,
  },
  { accessorKey: 'level', header: '级别', cell: ({ row }) => <StatusValue value={row.original.level} /> },
  { accessorKey: 'type', header: '事件类型' },
  {
    accessorKey: 'message',
    header: '消息 / 附加字段',
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-2">
        <span className="break-words">{row.original.message}</span>
        <JsonDetails value={row.original.details} title="事件附加字段" />
      </div>
    ),
  },
  {
    accessorKey: 'ownerUserId',
    header: '所属用户',
    cell: ({ row }) =>
      row.original.ownerUserId ? (
        <Link
          to="/administration/users/$id"
          params={{ id: row.original.ownerUserId }}
          className="break-all underline underline-offset-4"
        >
          {row.original.ownerUserId}
        </Link>
      ) : (
        '全局系统事件'
      ),
  },
  { accessorKey: 'id', header: '事件 ID' },
];

const HEARTBEAT_COLUMNS: ColumnDef<typeof tableFeatures, HeartbeatView>[] = [
  {
    accessorKey: 'id',
    header: '服务 ID',
    cell: ({ row }) => <span className="break-all">{row.original.id}</span>,
  },
  {
    accessorKey: 'instanceId',
    header: '实例 ID',
    cell: ({ row }) => <span className="break-all">{row.original.instanceId}</span>,
  },
  {
    accessorKey: 'lastSeenAt',
    header: '最近心跳（UTC）',
    cell: ({ row }) => <UtcValue value={row.original.lastSeenAt} />,
  },
  {
    id: 'status',
    header: '报告状态',
    cell: ({ row }) => (
      <StatusValue
        value={typeof row.original.details.status === 'string' ? row.original.details.status : null}
      />
    ),
  },
  {
    id: 'environment',
    header: '报告环境',
    cell: ({ row }) =>
      typeof row.original.details.environment === 'string' ? row.original.details.environment : '未知',
  },
  {
    id: 'details',
    header: '公开附加字段',
    cell: ({ row }) => <JsonDetails value={row.original.details} title="心跳附加字段" />,
  },
];

const ENDPOINT_COLUMNS: ColumnDef<typeof tableFeatures, EndpointView>[] = [
  {
    accessorKey: 'endpoint',
    header: '节点',
    cell: ({ row }) => <span className="break-all">{row.original.endpoint}</span>,
  },
  {
    accessorKey: 'ok',
    header: '缓存测量结果',
    cell: ({ row }) => (row.original.ok ? '该次测量可用' : '该次测量失败'),
  },
  {
    accessorKey: 'latencyMs',
    header: '该次延迟（ms）',
    cell: ({ row }) => <span className="tabular-nums">{row.original.latencyMs}</span>,
  },
  { accessorKey: 'error', header: '公开失败说明', cell: ({ row }) => row.original.error ?? '无失败说明' },
];

export function SystemEventsTable({
  events,
  title,
}: {
  readonly events: SystemEventView[];
  readonly title: string;
}) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  return (
    <DataTableShell
      data={events}
      columns={EVENT_COLUMNS}
      pagination={false}
      title={title}
      columnVisibility={visibility}
      onColumnVisibilityChange={setVisibility}
      getRowId={(row) => String(row.id)}
      emptyTitle="本次未返回系统事件"
    />
  );
}

export function HeartbeatsTable({ heartbeats }: { readonly heartbeats: HeartbeatView[] }) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  return (
    <section aria-labelledby="admin-heartbeats-title" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="admin-heartbeats-title" size="lg" weight="semibold">
        全部已存心跳
      </Text>
      <Text as="p" size="sm" color="secondary">
        按最近心跳倒序；这些是存储记录，旧行不表示实例仍在线。新鲜度与 production worker
        的权威判断见健康快照，不能把 DEGRADED / RECOVERING 标成健康。
      </Text>
      <DataTableShell
        data={heartbeats}
        columns={HEARTBEAT_COLUMNS}
        pagination={false}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        getRowId={(row) => row.id}
        emptyTitle="没有已存心跳记录"
      />
    </section>
  );
}

export function EndpointsTable({ endpoints }: { readonly endpoints: EndpointView[] }) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  return (
    <DataTableShell
      data={endpoints}
      columns={ENDPOINT_COLUMNS}
      pagination={false}
      columnVisibility={visibility}
      onColumnVisibilityChange={setVisibility}
      getRowId={(row) => row.endpoint}
      emptyTitle="缓存中没有节点测量行"
    />
  );
}
