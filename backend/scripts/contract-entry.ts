import { hc } from 'hono/client';
import type { AppType } from '../src/server/app';

// 此入口仅供 TypeScript 导出公开客户端声明，不参与后端运行。
export const contract = hc<AppType>('https://contract.invalid');
export type ApiClient = typeof contract;
