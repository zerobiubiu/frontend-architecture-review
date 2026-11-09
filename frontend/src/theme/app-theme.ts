import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { appIcons } from './icons.tsx';

/**
 * 项目主题源文件：仅扩展 Neutral 的基础样式，不重复定义颜色、圆角、字体 Token。
 *
 * 修改后执行 `bun run theme:build` 重新生成 `src/theme/generated/`；
 * 生成产物由 `bun run theme:check` 校验，禁止手工编辑。
 */
export const appTheme = defineTheme({
  name: 'binance-stocks',
  extends: neutralTheme,
  icons: appIcons,
});
