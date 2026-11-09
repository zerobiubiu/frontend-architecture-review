import { InternationalizationProvider, LayerProvider } from '@astryxdesign/core';
import zhCN from '@astryxdesign/core/locales/zh-CN.json';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { createQueryClient } from './query-client';
import { ThemeModeProvider } from './theme-provider';

export function AppProviders({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeModeProvider>
      {/* Astryx 组件内建文案统一为简体中文，避免“Select…” 等英文占位符混入界面。 */}
      <InternationalizationProvider locale="zh-CN" messages={{ 'zh-CN': zhCN }}>
        <LayerProvider toast={{ position: 'topEnd', maxVisible: 3 }}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </LayerProvider>
      </InternationalizationProvider>
    </ThemeModeProvider>
  );
}
