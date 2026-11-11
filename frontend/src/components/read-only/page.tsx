import { Text } from '@astryxdesign/core';
import { type ReactElement, type ReactNode, useId } from 'react';
import { ThemeModeToggle } from '@/components/shared/theme-mode-toggle';

export interface ReadPageProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
}

/** 页面内容沿用外层 ApplicationShell，不再创建导航或第二个应用壳。 */
export function ReadPage({ title, description, toolbar, children }: ReadPageProps): ReactElement {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Text as="h1" id={titleId} size="xl" weight="semibold">
            {title}
          </Text>
          {description === undefined ? null : <div className="text-secondary text-sm">{description}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <ThemeModeToggle />
        </div>
      </header>
      {children}
    </section>
  );
}
