import { defaultStringifySearch, useLocation, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { z } from 'zod';

export interface ReadSearchResult<T extends Record<string, unknown>> {
  readonly search: T;
  readonly error: string | null;
  readonly apply: (next: Record<string, unknown>) => string | null;
  readonly reset: () => void;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (pageSize: number) => void;
}

/** 已应用的筛选/分页只归 URL 所有；输入草稿由表单持有，不保存服务端数据。 */
export function useReadSearch<T extends Record<string, unknown>>(schema: z.ZodType<T>): ReadSearchResult<T> {
  const raw = useSearch({ strict: false });
  const location = useLocation();
  const router = useRouter();
  const parsed = useMemo(() => schema.safeParse(raw), [schema, raw]);
  const defaults = useMemo(() => schema.parse({}), [schema]);
  const search = parsed.success ? parsed.data : defaults;
  const error = parsed.success ? null : '地址中的筛选或分页参数无效，请重置后查询';

  const commit = useCallback(
    (candidate: Record<string, unknown>): string | null => {
      // 空输入表示取消该筛选；不擅自 trim 后端定义为原串的非空值。
      const clean = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== ''));
      const result = schema.safeParse(clean);
      if (!result.success) {
        return `筛选未应用：${result.error.issues.map((issue) => issue.path.join('.')).join('、')}`;
      }
      const stringify = router.options.stringifySearch ?? defaultStringifySearch;
      void router.navigate({ href: `${location.pathname}${stringify(result.data)}` });
      return null;
    },
    [schema, router, location.pathname],
  );
  const apply = useCallback(
    (next: Record<string, unknown>) => commit({ ...search, ...next, page: 1 }),
    [commit, search],
  );
  const reset = useCallback(() => {
    void commit(defaults);
  }, [commit, defaults]);
  const setPage = useCallback(
    (page: number) => {
      void commit({ ...search, page });
    },
    [commit, search],
  );
  const setPageSize = useCallback(
    (pageSize: number) => {
      void commit({ ...search, pageSize, page: 1 });
    },
    [commit, search],
  );
  return { search, error, apply, reset, setPage, setPageSize };
}
