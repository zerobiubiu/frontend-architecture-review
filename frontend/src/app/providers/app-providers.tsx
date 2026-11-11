import { InternationalizationProvider, LayerProvider } from '@astryxdesign/core';
import zhCN from '@astryxdesign/core/locales/zh-CN.json';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { type AppServices, createAppServices } from '@/app/runtime';
import { AppServicesContext } from '@/app/runtime-context';
import { ThemeModeProvider } from './theme-provider';

export function AppProviders({
  children,
  services: suppliedServices,
}: {
  readonly children: ReactNode;
  readonly services?: AppServices;
}) {
  const [services] = useState(() => suppliedServices ?? createAppServices());
  useEffect(() => services.start(), [services]);

  return (
    <ThemeModeProvider>
      {/* Astryx 组件内建文案统一为简体中文，避免“Select…” 等英文占位符混入界面。 */}
      <InternationalizationProvider locale="zh-CN" messages={{ 'zh-CN': zhCN }}>
        <LayerProvider toast={{ position: 'topEnd', maxVisible: 3 }}>
          <QueryClientProvider client={services.queryClient}>
            <AppServicesContext value={services}>{children}</AppServicesContext>
          </QueryClientProvider>
        </LayerProvider>
      </InternationalizationProvider>
    </ThemeModeProvider>
  );
}
