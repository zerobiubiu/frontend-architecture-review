import { Banner, Button, Skeleton, Text } from '@astryxdesign/core';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { useBusinessSync } from '@/app/runtime-context';
import { isReadAccessError } from '@/lib/read-only/response';
import type { BusinessSyncSnapshot } from '@/services/realtime/manager';

export interface QuerySurfaceProps<T> {
  readonly query: UseQueryResult<T, Error>;
  readonly children: (data: T) => ReactNode;
  readonly disabledReason?: string;
  readonly label?: string;
}

const DISCONNECTED_LABELS = {
  idle: '业务通知未连接',
  connecting: '业务通知连接中',
  open: '业务通知已连接',
  reconnecting: '业务通知恢复中',
  degraded: '业务通知已暂停',
} satisfies Record<BusinessSyncSnapshot['status'], string>;

const CACHE_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hourCycle: 'h23',
});

function LastSuccess({ updatedAt }: { readonly updatedAt: number }): ReactElement {
  const instant = new Date(updatedAt);
  const known = updatedAt > 0 && !Number.isNaN(instant.getTime());
  return (
    <Text as="p" size="sm" color="secondary">
      最后成功 REST 缓存时间（客户端）：
      {known ? <time dateTime={instant.toISOString()}>{CACHE_TIME_FORMAT.format(instant)} UTC</time> : '未知'}
      ；不是服务端数据来源时间。
    </Text>
  );
}

/** 只消费既有查询与通知状态；不发起请求，也不在展示层失效缓存。 */
export function QuerySurface<T>({
  query,
  children,
  disabledReason,
  label = '查询结果',
}: QuerySurfaceProps<T>): ReactElement {
  const sync = useBusinessSync();
  const unavailable =
    disabledReason ??
    (!query.isEnabled && !isReadAccessError(query.error) ? '当前会话或查询条件尚不允许读取' : undefined);
  if (unavailable !== undefined) {
    return (
      <section aria-label={label} className="flex min-w-0 flex-col gap-3">
        <Banner status="info" title="尚未查询" description={unavailable} />
      </section>
    );
  }

  if (isReadAccessError(query.error)) {
    return (
      <section aria-label={label} className="flex min-w-0 flex-col gap-3">
        <Banner
          status="error"
          title="当前范围不可读取"
          description={query.error?.message ?? '会话、读取权限或记录已失效，不能继续展示先前缓存。'}
        />
        <Button
          label="重新核对访问权限"
          variant="secondary"
          isDisabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        />
      </section>
    );
  }

  const data = query.data;
  const hasData = data !== undefined;
  const paused = query.fetchStatus === 'paused';
  return (
    <section aria-label={label} aria-busy={query.isFetching} className="flex min-w-0 flex-col gap-3">
      <Text as="p" size="sm" color="secondary">
        {sync.status === 'open'
          ? '业务通知已连接，仅提供资源变化提示，不表示业务已同步；数据以最后成功 REST 结果为准。'
          : `${DISCONNECTED_LABELS[sync.status]}，非实时；仅展示最后成功 REST 结果（如有）。`}
      </Text>
      {query.isEnabled || query.isError ? (
        <div>
          <Button
            label="重新读取"
            variant="secondary"
            isDisabled={query.isFetching || paused}
            onClick={() => {
              void query.refetch();
            }}
          />
        </div>
      ) : null}

      {hasData ? (
        <>
          <LastSuccess updatedAt={query.dataUpdatedAt} />
          {query.isError ? (
            <Banner status="error" title="最新读取失败，保留上次成功结果" description={query.error.message} />
          ) : null}
          {paused ? (
            <Banner
              status="warning"
              title="更新已暂停"
              description="当前离线，保留最后成功 REST 结果；尚未确认最新数据。"
            />
          ) : query.isFetching ? (
            <Text as="p" size="sm" color="secondary" role="status">
              正在重新读取，继续展示上次成功结果。
            </Text>
          ) : null}
          {query.isStale ? (
            <Text as="p" size="sm" color="secondary">
              数据可能已过期；当前结果不代表服务端最新状态。
            </Text>
          ) : null}
          {children(data)}
        </>
      ) : paused ? (
        <Banner
          status="warning"
          title="查询已暂停"
          description="当前离线，尚无成功 REST 结果；不能将未读取的数据视为空结果。"
        />
      ) : query.isError ? (
        <Banner status="error" title="读取失败" description={query.error.message} />
      ) : query.isFetching ? (
        <div className="flex flex-col gap-2" role="status" aria-label="正在读取数据">
          <Text size="sm" color="secondary">
            正在读取，尚无成功 REST 结果。
          </Text>
          <Skeleton height={30} />
          <Skeleton height={30} />
        </div>
      ) : (
        <Banner status="info" title="等待查询" description="尚未获得成功 REST 结果。" />
      )}
    </section>
  );
}
