import { Button, Text } from '@astryxdesign/core';
import { useNavigate } from '@tanstack/react-router';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <section className="flex flex-col items-start gap-3 py-16">
      <Text as="h1" size="lg" weight="semibold">
        页面不存在
      </Text>
      <Text color="secondary">该地址没有对应页面；开发验证页仅在开发环境注册。</Text>
      <Button label="返回工作台" variant="secondary" onClick={() => void navigate({ to: '/' })} />
    </section>
  );
}
