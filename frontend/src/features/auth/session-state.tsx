import { Banner, Button, Skeleton, Text } from '@astryxdesign/core';
import { useAppServices, useSession } from '@/app/runtime-context';

export function SessionState() {
  const { session } = useAppServices();
  const snapshot = useSession();
  const busy = ['initializing', 'checking', 'signing-in', 'signing-out'].includes(snapshot.status);
  if (busy) {
    return (
      <section
        className="mx-auto flex w-full max-w-xl flex-col gap-4 py-12"
        aria-busy="true"
        role="status"
        aria-label="正在确认会话"
      >
        <Text as="h1" size="lg" weight="semibold">
          {snapshot.status === 'signing-out' ? '正在退出登录' : '正在确认会话'}
        </Text>
        <Skeleton width="100%" height={20} />
        <Skeleton width="70%" height={20} />
        <Text color="secondary">确认身份前不会显示受保护内容。</Text>
        {snapshot.status === 'checking' ? (
          <Button
            label="手动重新验证会话"
            variant="secondary"
            onClick={() => {
              void session.restore();
            }}
          />
        ) : null}
      </section>
    );
  }
  const unconfirmed = snapshot.status === 'logout-unconfirmed';
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4 py-12" role="alert">
      <Text as="h1" size="lg" weight="semibold">
        {unconfirmed ? '服务端注销未确认' : '暂时无法确认会话'}
      </Text>
      <Banner
        status="warning"
        title={unconfirmed ? '本地已清理' : '认证服务暂不可用'}
        description={snapshot.error ?? '请检查连接后重新验证身份；不会自动使用旧缓存或假登录。'}
      />
      <div className="flex flex-wrap gap-3">
        {unconfirmed ? (
          <Button
            label="重试退出"
            onClick={() => {
              void session.logout();
            }}
          />
        ) : null}
        <Button
          label={unconfirmed ? '重新验证当前凭据（可能恢复会话）' : '重新验证会话'}
          variant="secondary"
          onClick={() => {
            void session.restore();
          }}
        />
      </div>
    </section>
  );
}
