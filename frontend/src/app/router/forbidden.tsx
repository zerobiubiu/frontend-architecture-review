import { Button, Text } from '@astryxdesign/core';
import { useNavigate } from '@tanstack/react-router';

export function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <section className="flex flex-col items-start gap-4 py-12" role="alert">
      <Text as="h1" size="lg" weight="semibold">
        无权访问
      </Text>
      <Text color="secondary">当前身份没有此页面所需权限。管理员不会自动取得交易员权限。</Text>
      <Button
        label="返回工作台"
        variant="secondary"
        onClick={() => {
          void navigate({ to: '/' });
        }}
      />
    </section>
  );
}
