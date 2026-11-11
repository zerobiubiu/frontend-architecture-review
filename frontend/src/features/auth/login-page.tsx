import { Banner, Button, Card, Text, TextInput } from '@astryxdesign/core';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@project/api-contracts/validation';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useAppServices, useSession } from '@/app/runtime-context';
import { safeReturnTo } from './return-to';
import { SessionState } from './session-state';
import type { LoginInput } from './types';

const formSchema = loginSchema.strict();

export function LoginPage() {
  const { session } = useAppServices();
  const snapshot = useSession();
  const search = useSearch({ strict: false });
  const returnTo = safeReturnTo(search.returnTo);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    // 只从登录页发起一次成功跳转，避免旧匹配在 pending 期间反复取消新导航。
    if (snapshot.status === 'authenticated' && location.pathname === '/login') {
      void navigate({ href: returnTo, replace: true });
    }
  }, [navigate, snapshot.status, location.pathname, returnTo]);
  const form = useForm<LoginInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', password: '' },
  });
  const submitting = useRef(false);
  if (snapshot.status === 'authenticated') return null;
  if (
    snapshot.status === 'initializing' ||
    snapshot.status === 'checking' ||
    snapshot.status === 'signing-out' ||
    snapshot.status === 'logout-unconfirmed'
  )
    return <SessionState />;
  const busy = snapshot.status === 'signing-in';
  return (
    <section
      className="mx-auto flex w-full max-w-md flex-col gap-6 py-10 sm:py-16"
      aria-labelledby="login-title"
    >
      <div className="flex flex-col gap-2">
        <Text as="h1" id="login-title" size="xl" weight="semibold">
          登录美股交易管理
        </Text>
        <Text color="secondary">使用平台账号继续。身份验证与交易权限由服务端确认。</Text>
      </div>
      <Card padding={6}>
        <form
          className="flex flex-col gap-5"
          aria-label="平台登录"
          noValidate
          onSubmit={form.handleSubmit(async (input) => {
            if (submitting.current) return;
            submitting.current = true;
            try {
              const result = await session.login(input);
              if (result.kind !== 'stale') form.setValue('password', '');
            } finally {
              submitting.current = false;
            }
          })}
        >
          <Controller
            name="username"
            control={form.control}
            render={({ field, fieldState }) => (
              <TextInput
                label="用户名"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                autoComplete="username"
                htmlName="username"
                isRequired
                isDisabled={busy}
                hasSpellCheck={false}
                status={
                  fieldState.error
                    ? {
                        type: 'error',
                        message:
                          fieldState.error.type === 'too_big' ? '用户名过长，请减少字符' : '请输入用户名',
                      }
                    : undefined
                }
              />
            )}
          />
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <TextInput
                label="密码"
                type="password"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                autoComplete="current-password"
                htmlName="password"
                isRequired
                isDisabled={busy}
                status={
                  fieldState.error
                    ? {
                        type: 'error',
                        message:
                          fieldState.error.type === 'too_big'
                            ? '密码过长，不会自动截断'
                            : '请输入密码（输入空格会保留）',
                      }
                    : undefined
                }
              />
            )}
          />
          {snapshot.error ? <Banner status="error" title="登录未完成" description={snapshot.error} /> : null}
          <Button type="submit" label={busy ? '正在登录' : '登录'} isLoading={busy} isDisabled={busy} />
          {snapshot.status === 'unavailable' ? (
            <Button
              label="重新验证现有会话"
              variant="ghost"
              onClick={() => {
                void session.restore();
              }}
            />
          ) : null}
        </form>
      </Card>
      <Text size="sm" color="secondary">
        密码不会保存到浏览器持久存储。退出登录不会停止服务端已经启动的任务。
      </Text>
    </section>
  );
}
