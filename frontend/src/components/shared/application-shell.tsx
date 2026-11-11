import {
  AppShell,
  Avatar,
  Badge,
  Banner,
  Button,
  DropdownMenu,
  DropdownMenuItem,
  IconButton,
  MobileNavToggle,
  Popover,
  SideNav,
  SideNavCollapseButton,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
  Text,
  TopNav,
} from '@astryxdesign/core';
import {
  IconArrowsExchange,
  IconBell,
  IconBuildingBank,
  IconChevronDown,
  IconHome,
  IconLogout,
  IconShield,
  IconWallet,
} from '@tabler/icons-react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useAppServices, useBusinessSync, useSession } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import { PROTOCOL_STUB_MODE, ProtocolModeBanner } from './protocol-mode-banner';

const SYNC_LABELS = {
  idle: '业务通知未连接',
  connecting: '业务通知连接中',
  open: '业务通知已连接',
  reconnecting: '业务通知恢复中',
  degraded: '业务通知已暂停',
} as const;

interface ReadNavigationItem {
  readonly label: string;
  readonly href: string;
  readonly icon: ReactNode;
}
const readSections: readonly { title: string; items: readonly ReadNavigationItem[] }[] = [
  {
    title: '工作台',
    items: [{ label: '工作台', href: '/', icon: <IconHome size={18} aria-hidden="true" /> }],
  },
  {
    title: '证券与交易查询',
    items: [
      { label: '证券与规则', href: '/securities', icon: <IconArrowsExchange size={18} aria-hidden="true" /> },
      { label: '行情报价', href: '/market', icon: <IconArrowsExchange size={18} aria-hidden="true" /> },
      { label: '订单查询', href: '/orders', icon: <IconArrowsExchange size={18} aria-hidden="true" /> },
      { label: '批量任务查询', href: '/tasks', icon: <IconArrowsExchange size={18} aria-hidden="true" /> },
      { label: '操作记录', href: '/operations', icon: <IconArrowsExchange size={18} aria-hidden="true" /> },
    ],
  },
  {
    title: '账户与账本',
    items: [
      { label: '账户查询', href: '/accounts', icon: <IconWallet size={18} aria-hidden="true" /> },
      { label: '持仓来源', href: '/positions', icon: <IconWallet size={18} aria-hidden="true" /> },
      { label: '成交历史', href: '/trades', icon: <IconWallet size={18} aria-hidden="true" /> },
      { label: '账本记录', href: '/ledger', icon: <IconWallet size={18} aria-hidden="true" /> },
      { label: '核对记录', href: '/reconciliations', icon: <IconWallet size={18} aria-hidden="true" /> },
    ],
  },
];
const administrationItems: readonly ReadNavigationItem[] = [
  { label: '管理概览', href: '/administration', icon: <IconShield size={18} aria-hidden="true" /> },
  { label: '用户查询', href: '/administration/users', icon: <IconShield size={18} aria-hidden="true" /> },
  { label: '管理账户', href: '/administration/accounts', icon: <IconShield size={18} aria-hidden="true" /> },
  { label: '审计记录', href: '/administration/audit', icon: <IconShield size={18} aria-hidden="true" /> },
  {
    label: '系统与 Worker',
    href: '/administration/system',
    icon: <IconShield size={18} aria-hidden="true" />,
  },
];

export function ApplicationShell({ children }: { readonly children: ReactNode }) {
  const { session, businessSync } = useAppServices();
  const snapshot = useSession();
  const sync = useBusinessSync();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = snapshot.user;
  if (!user || snapshot.status !== 'authenticated') return null;
  const collapsible = { isCollapsed: collapsed, onCollapsedChange: setCollapsed, hasButton: false };
  function renderNavigationItem(item: ReadNavigationItem) {
    const exact = item.href === '/' || item.href === '/administration';
    const selected =
      location.pathname === item.href || (!exact && location.pathname.startsWith(`${item.href}/`));
    return (
      <SideNavItem
        key={item.href}
        label={item.label}
        href={item.href}
        icon={item.icon}
        isSelected={selected}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          void navigate({ href: item.href });
        }}
      />
    );
  }
  return (
    <AppShell
      variant="section"
      contentPadding={6}
      height="fill"
      className="bg-body text-primary"
      data-testid="application-shell"
      mobileNav={{ hasToggle: false, breakpoint: 'md' }}
      banner={
        PROTOCOL_STUB_MODE || sync.status === 'degraded' ? (
          <div className="flex min-w-0 flex-col gap-2">
            {PROTOCOL_STUB_MODE ? <ProtocolModeBanner /> : null}
            {sync.status === 'degraded' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Banner
                  status="warning"
                  title="业务通知已暂停"
                  description={sync.error ?? '当前结果以最后成功 REST 读取为准。'}
                />
                <Button label="重试业务连接" variant="secondary" onClick={() => businessSync.retry()} />
              </div>
            ) : null}
          </div>
        ) : undefined
      }
      sideNav={
        <SideNav
          aria-label="应用导航"
          collapsible={collapsible}
          header={
            <SideNavHeading
              icon={<IconBuildingBank size={24} aria-hidden="true" />}
              heading="美股交易管理"
              subheading="只读业务查询"
            />
          }
        >
          {readSections.map((section) => (
            <SideNavSection key={section.title} title={section.title}>
              {section.items.map(renderNavigationItem)}
            </SideNavSection>
          ))}
          {hasCapability(user, 'administration') ? (
            <SideNavSection title="系统管理">{administrationItems.map(renderNavigationItem)}</SideNavSection>
          ) : null}
        </SideNav>
      }
      topNav={
        <TopNav
          label="应用顶栏"
          heading={
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden md:block">
                <SideNavCollapseButton
                  collapsible={collapsible}
                  label={collapsed ? '展开侧栏' : '折叠侧栏'}
                />
              </span>
              <div className="flex flex-wrap items-center gap-2" role="status" aria-label="连接状态">
                <span className="hidden lg:inline-flex">
                  <Badge label={snapshot.apiReachable ? '认证 API 已响应' : 'API 待确认'} variant="neutral" />
                </span>
                <span className="hidden md:inline-flex">
                  <Badge label="会话已验证" variant="neutral" />
                </span>
                <Text size="sm" color="secondary">
                  {SYNC_LABELS[sync.status]}
                </Text>
              </div>
            </div>
          }
          endContent={
            <div className="flex min-w-0 items-center gap-2">
              <MobileNavToggle label="打开导航" />
              <Popover
                label="通知说明"
                content={<Text size="sm">本阶段未接入通知中心，不展示业务通知或虚假未读数量。</Text>}
              >
                {(props) => (
                  <IconButton
                    {...props}
                    label="通知"
                    icon={<IconBell size={18} aria-hidden="true" />}
                    variant="ghost"
                  />
                )}
              </Popover>
              <Avatar name={user.username} size="sm" tooltip={false} />
              <span
                className="hidden max-w-32 truncate font-semibold text-sm sm:inline"
                data-testid="current-username"
              >
                {user.username}
              </span>
              <DropdownMenu
                alignment="end"
                renderTrigger={(props) => (
                  <IconButton
                    {...props}
                    label="用户菜单"
                    icon={<IconChevronDown size={18} aria-hidden="true" />}
                    variant="ghost"
                  />
                )}
              >
                <DropdownMenuItem
                  label={user.username}
                  description={user.role === 'ADMIN' ? '平台管理员' : '交易员'}
                  isDisabled
                />
                <DropdownMenuItem
                  label="重新验证会话"
                  onClick={() => {
                    void session.restore();
                  }}
                />
                <DropdownMenuItem
                  label="退出登录"
                  icon={<IconLogout size={18} aria-hidden="true" />}
                  variant="destructive"
                  onClick={() => {
                    void session.logout();
                  }}
                />
              </DropdownMenu>
            </div>
          }
        />
      }
    >
      <div className="mx-auto w-full min-w-0">{children}</div>
    </AppShell>
  );
}
