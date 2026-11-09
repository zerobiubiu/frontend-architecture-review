import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/app/providers/app-providers';
import { router } from '@/app/router';
import '@/styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('未找到 #root 挂载节点');

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
