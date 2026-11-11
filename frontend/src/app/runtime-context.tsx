import { createContext, use, useSyncExternalStore } from 'react';
import type { AppServices } from './runtime';

export const AppServicesContext = createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
  const services = use(AppServicesContext);
  if (!services) throw new Error('应用服务未初始化');
  return services;
}

export function useSession() {
  const { session } = useAppServices();
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

export function useBusinessSync() {
  const { businessSync } = useAppServices();
  return useSyncExternalStore(businessSync.subscribe, businessSync.getSnapshot, businessSync.getSnapshot);
}
