import { useMemo } from 'react';
import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { type QuotesDto, readQuotes } from './api';
import { marketKeys } from './query-keys';
import type { MarketSearch } from './schemas';

export interface RestQuoteRead {
  readonly quotes: QuotesDto;
  readonly streamRevisionAtStart: number;
}
export const canReadMarket = (user: AuthUser): boolean => hasCapability(user, 'workspace');

export function useMarketQuote(search: MarketSearch, enabled = true) {
  const { rpc, market } = useAppServices();
  const scope = useQueryScope();
  const queryKey = useMemo(() => marketKeys.quotes(scope, search), [scope, search]);
  return useResourceQuery({
    queryKey,
    resource: 'accounts',
    accountId: search.accountId ?? null,
    canRead: canReadMarket,
    enabled: enabled && search.accountId !== undefined && search.symbol !== undefined,
    queryFn: async (signal): Promise<RestQuoteRead> => {
      const streamRevisionAtStart = market.getSnapshot().quoteRevision;
      const quotes = await readQuotes(rpc, search, signal);
      return { quotes, streamRevisionAtStart };
    },
  });
}
