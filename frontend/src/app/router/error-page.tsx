import { Button, Text } from '@astryxdesign/core';
import type { ErrorComponentProps } from '@tanstack/react-router';

export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <section className="flex flex-col items-start gap-3 py-16" role="alert">
      <Text as="h1" size="lg" weight="semibold">
        页面渲染失败
      </Text>
      <Text color="secondary">{error instanceof Error ? error.message : '未知渲染错误'}</Text>
      <Button label="重试" variant="secondary" onClick={() => reset()} />
    </section>
  );
}
