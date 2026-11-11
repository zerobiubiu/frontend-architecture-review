import { Banner, Text } from '@astryxdesign/core';
import { Link, useParams } from '@tanstack/react-router';
import { useSession } from '@/app/runtime-context';
import { DefinitionList } from '@/components/read-only/object-details';
import { ReadPage } from '@/components/read-only/page';
import { QuerySurface } from '@/components/read-only/query-surface';
import { DecimalValue, StatusValue, UtcValue } from '@/components/read-only/values';
import { hasCapability } from '@/features/auth/permissions';
import { uuidSchema } from '@/lib/read-only/schemas';
import { useAccountDetail } from './queries';
import { AccountReadLinks, accountLinkClass } from './read-links';
import { WalletEvidence } from './wallet-evidence';

export function AccountDetailPage() {
  const { id } = useParams({ strict: false });
  const session = useSession();
  const user = session.status === 'authenticated' ? session.user : null;
  const isAdmin = Boolean(user && hasCapability(user, 'administration'));
  const validId = uuidSchema.safeParse(id).success;
  const query = useAccountDetail(id);
  return (
    <ReadPage
      title="账户详情"
      description="GET /accounts/:id 的已存安全投影。仅读取，不发起连接检查、同步、核对或任何账户变更；管理员读取可能写审计。"
      toolbar={
        <Link to={isAdmin ? '/administration/accounts' : '/accounts'} className={accountLinkClass}>
          返回账户列表
        </Link>
      }
    >
      <QuerySurface
        query={query}
        disabledReason={validId ? undefined : '账户 ID 必须是有效 UUID；未发送账户请求。'}
        label="账户详情读取结果"
      >
        {(account) => (
          <>
            <section aria-labelledby="account-identity-heading" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="account-identity-heading" size="lg" weight="semibold">
                {account.label || '未命名账户'}
              </Text>
              <DefinitionList
                items={[
                  { label: '账户 ID', value: account.id },
                  {
                    label: '所有者 ID',
                    value: isAdmin ? (
                      <Link
                        to="/administration/users/$id"
                        params={{ id: account.ownerUserId }}
                        className={accountLinkClass}
                      >
                        {account.ownerUserId}
                      </Link>
                    ) : (
                      account.ownerUserId
                    ),
                  },
                  { label: '交易所', value: account.exchange },
                  { label: '账户状态', value: <StatusValue value={account.status} /> },
                  { label: '已存连接状态', value: <StatusValue value={account.connectionStatus} /> },
                  { label: '连接说明', value: account.connectionMessage ?? '未知' },
                  { label: '完整凭据已保存', value: account.hasCredentials ? '是' : '否' },
                  { label: 'API Key 尾号（非完整凭据）', value: account.apiKeyLast4 ?? '未知' },
                ]}
              />
              <AccountReadLinks accountId={account.id} />
            </section>
            <section aria-labelledby="account-funding-heading" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="account-funding-heading" size="lg" weight="semibold">
                识别的资金投影与本地预留
              </Text>
              <Banner
                status={account.assetsAvailable ? 'info' : 'warning'}
                title={account.assetsAvailable ? '已识别 Funding USDC 快照' : '官方 Funding 可用金额未知'}
                description={account.assetMessage}
              />
              <DefinitionList
                items={[
                  { label: '识别来源', value: <StatusValue value={account.source} /> },
                  { label: 'assetsAvailable（快照识别）', value: account.assetsAvailable ? '是' : '否' },
                  {
                    label: 'Funding availableCash（USDC 快照）',
                    value: (
                      <DecimalValue value={account.availableCash} currency={account.settlementCurrency} />
                    ),
                  },
                  { label: 'cashBalance（接口未提供）', value: <DecimalValue value={account.cashBalance} /> },
                  {
                    label: '本地 reservedCash（不可执行资金）',
                    value: <DecimalValue value={account.reservedCash} />,
                  },
                  { label: '本地现金余额 / 可用金额', value: '未知；localSnapshot 均未提供' },
                  {
                    label: '已存 walletSyncError',
                    value: account.walletSyncError ?? '无已存错误（不证明当次官方读取成功）',
                  },
                  { label: '外部快照来源', value: <StatusValue value={account.externalSnapshot.source} /> },
                  {
                    label: '外部 availableCash 投影',
                    value: (
                      <DecimalValue
                        value={account.externalSnapshot.availableCash}
                        currency={account.settlementCurrency}
                      />
                    ),
                  },
                  {
                    label: '外部现金余额 / 持仓',
                    value: '未知；externalSnapshot.cashBalance / positions 未提供',
                  },
                ]}
              />
              <Text as="p" size="sm" color="secondary">
                localSnapshot.reservedCash 是同一条本地预留的重复投影，不是额外资金；不与 Funding free 相加，
                也不计算 availableCash − reservedCash 作为可执行预算。walletSyncError
                存在时，旧钱包金额仅为历史证据。
              </Text>
            </section>
            <section aria-labelledby="account-readiness-heading" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="account-readiness-heading" size="lg" weight="semibold">
                已存准备度与币种边界
              </Text>
              <DefinitionList
                items={[
                  { label: '买入准备度 buyReady', value: account.buyReady ? '是' : '否' },
                  { label: '卖出准备度 sellReady', value: account.sellReady ? '是' : '否' },
                  { label: '通用准备度 tradingReady', value: account.tradingReady ? '是' : '否' },
                  { label: '交易开关 tradingEnabled', value: account.tradingEnabled ? '开启' : '关闭' },
                  { label: '管理员交易限制', value: account.adminTradingBlocked ? '已限制' : '未限制' },
                  { label: '管理员限制原因', value: account.adminBlockReason ?? '未提供' },
                  { label: '交易配置修订 tradingRevision', value: String(account.tradingRevision) },
                  {
                    label: '报价币种 / 结算币种',
                    value: `${account.quoteCurrency} / ${account.settlementCurrency}`,
                  },
                ]}
              />
              <Text as="p" size="sm" color="secondary">
                准备度是服务端基于已存凭据、状态、开关与连接计算的布尔值，不是资金充分性、当前交易许可、
                平台健康或任意证券可卖库存的证明。买入仍需当次资金预检，卖出仍需当次证券库存预检。 USD
                报价不能冒充 USDC 现金，本页不换算、不汇总、不推算盈亏。
              </Text>
            </section>
            <section aria-labelledby="account-times-heading" className="flex min-w-0 flex-col gap-3">
              <Text as="h2" id="account-times-heading" size="lg" weight="semibold">
                来源与时间
              </Text>
              <DefinitionList
                items={[
                  { label: '记录创建 createdAt', value: <UtcValue value={account.createdAt} /> },
                  {
                    label: '记录更新 updatedAt（非成功同步）',
                    value: <UtcValue value={account.updatedAt} />,
                  },
                  { label: '已存 lastSyncAt', value: <UtcValue value={account.lastSyncAt} /> },
                  {
                    label: '钱包快照 receivedAt（本地接收）',
                    value: <UtcValue value={account.walletSnapshot?.receivedAt} />,
                  },
                  {
                    label: '外部投影 receivedAt（可能为旧值）',
                    value: <UtcValue value={account.externalSnapshot.receivedAt} />,
                  },
                  {
                    label: '上游资产更新时间 sourceUpdatedAt',
                    value: '账户 API 未提供；不能用记录更新时间或接收时间代替',
                  },
                ]}
              />
            </section>
            <WalletEvidence account={account} />
            <Text as="p" size="sm" color="secondary">
              能力缺口：没有独立余额、来源、连接诊断 GET，没有账户快照 stale 标志 / 新鲜度 TTL，
              没有完整官方资产估值或盈亏。重新读取只获取账户记录，不调用 POST 检查 / 同步 / 核对。
              所有者姓名未在账户 DTO 中提供；管理员可进入真实用户只读查询页。
            </Text>
          </>
        )}
      </QuerySurface>
    </ReadPage>
  );
}
