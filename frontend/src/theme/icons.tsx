import type { IconName } from '@astryxdesign/core/Icon';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowsUpDown,
  IconArrowUp,
  IconCalendar,
  IconCheck,
  IconChecks,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconColumns3,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconEyeOff,
  IconFilter,
  IconInfoCircle,
  IconMenu2,
  IconMicrophone,
  IconSearch,
  IconSquare,
  IconTool,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { createElement, type ReactElement } from 'react';

/**
 * Astryx 语义图标 → Tabler 图标注册表。
 *
 * 必须保持纯 TS（不使用 JSX）：`astryx theme build` 会用 Node 加载本模块并把它内联进生成产物。
 * 业务图标仍然可以直接 `import { IconX } from '@tabler/icons-react'` 并使用，不必经过此处。
 */
const iconDefaults = { size: '1em', 'aria-hidden': true } as const;

const icon = (component: typeof IconX): ReactElement => createElement(component, iconDefaults);

export const appIcons = {
  close: icon(IconX),
  chevronDown: icon(IconChevronDown),
  chevronLeft: icon(IconChevronLeft),
  chevronRight: icon(IconChevronRight),
  chevronsLeft: icon(IconChevronsLeft),
  chevronsRight: icon(IconChevronsRight),
  check: icon(IconCheck),
  success: icon(IconCircleCheck),
  error: icon(IconCircleX),
  warning: icon(IconAlertTriangle),
  info: icon(IconInfoCircle),
  calendar: icon(IconCalendar),
  clock: icon(IconClock),
  externalLink: icon(IconExternalLink),
  menu: icon(IconMenu2),
  moreHorizontal: icon(IconDots),
  search: icon(IconSearch),
  upload: icon(IconUpload),
  arrowUp: icon(IconArrowUp),
  arrowDown: icon(IconArrowDown),
  arrowsUpDown: icon(IconArrowsUpDown),
  funnel: icon(IconFilter),
  eyeSlash: icon(IconEyeOff),
  viewColumns: icon(IconColumns3),
  copy: icon(IconCopy),
  checkDouble: icon(IconChecks),
  wrench: icon(IconTool),
  stop: icon(IconSquare),
  microphone: icon(IconMicrophone),
} satisfies Record<IconName, ReactElement>;
