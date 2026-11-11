import { Text } from '@astryxdesign/core';
import { useParams } from '@tanstack/react-router';
import { ForbiddenPage } from '@/app/router/forbidden';
import { ProtectedRoute } from '@/app/router/protected-route';
import { CAPABILITY_LABELS, isCapability } from '@/features/auth/permissions';

export function AccessProbePage() {
  const { capability } = useParams({ from: '/dev/access/$capability' });
  if (!isCapability(capability)) return <ForbiddenPage />;
  return (
    <ProtectedRoute capability={capability}>
      <section className="flex flex-col gap-3 py-8" data-testid="capability-probe">
        <Text as="h1" size="lg">
          {CAPABILITY_LABELS[capability]}权限已验证
        </Text>
        <Text color="secondary">仅开发环境的权限路由探针；不是业务页面，不调用交易或管理接口。</Text>
      </section>
    </ProtectedRoute>
  );
}
