import { Banner, Text } from '@astryxdesign/core';
import { DefinitionList } from '@/components/read-only/object-details';
import { DecimalValue, UtcValue } from '@/components/read-only/values';
import type { AccountView } from './schemas';

/** 已保存的钱包证据与当前被认可的账户投影明确分开。 */
export function WalletEvidence({ account }: { readonly account: AccountView }) {
  const snapshot = account.walletSnapshot;
  const funding = snapshot?.funding;
  const spot = snapshot?.spotUsdc;
  return (
    <section aria-labelledby="wallet-evidence-heading" className="flex min-w-0 flex-col gap-3">
      <Text as="h2" id="wallet-evidence-heading" size="lg" weight="semibold">
        已存钱包快照（历史证据）
      </Text>
      <Banner
        status={account.walletSyncError ? 'warning' : 'info'}
        title={account.walletSyncError ? '已有快照不能覆盖同步错误' : '保存的快照不是当次官方资产读取'}
        description="下列 Funding / Spot 明细可在失败后仍被保留；不作为可执行预算或实时余额。未返回的金额和权限保持未知，不补零。不提供快照新鲜度 TTL。"
      />
      {snapshot === null ? (
        <Text as="p" size="sm" color="secondary">
          未保存钱包快照；不能据此判断余额为零或凭据具备何种官方权限。
        </Text>
      ) : (
        <>
          <DefinitionList
            items={[
              { label: '钱包来源', value: snapshot.source },
              { label: '钱包快照接收时间（本地）', value: <UtcValue value={snapshot.receivedAt} /> },
              {
                label: '只读权限',
                value:
                  snapshot.permissions.reading === null ? '未知' : snapshot.permissions.reading ? '是' : '否',
              },
              {
                label: 'Spot / Margin 交易权限',
                value:
                  snapshot.permissions.spotAndMarginTrading === null
                    ? '未知'
                    : snapshot.permissions.spotAndMarginTrading
                      ? '是'
                      : '否',
              },
              {
                label: '提现权限',
                value:
                  snapshot.permissions.withdrawals === null
                    ? '未知'
                    : snapshot.permissions.withdrawals
                      ? '是'
                      : '否',
              },
              {
                label: 'IP 限制',
                value:
                  snapshot.permissions.ipRestricted === null
                    ? '未知'
                    : snapshot.permissions.ipRestricted
                      ? '是'
                      : '否',
              },
            ]}
          />
          <Text as="h3" size="base" weight="semibold">
            Funding / CARD / USDC
          </Text>
          {funding ? (
            <DefinitionList
              items={[
                { label: 'Funding 来源', value: funding.source },
                { label: '钱包类型 / 资产', value: `${funding.walletType} / ${funding.asset}` },
                {
                  label: '已存 free（历史）',
                  value: <DecimalValue value={funding.free} currency={funding.asset} />,
                },
                {
                  label: '已存 locked',
                  value: <DecimalValue value={funding.locked} currency={funding.asset} />,
                },
                {
                  label: '已存 freeze',
                  value: <DecimalValue value={funding.freeze} currency={funding.asset} />,
                },
                {
                  label: '已存 withdrawing',
                  value: <DecimalValue value={funding.withdrawing} currency={funding.asset} />,
                },
                { label: 'Funding 接收时间（本地）', value: <UtcValue value={funding.receivedAt} /> },
              ]}
            />
          ) : (
            <Text as="p" size="sm" color="secondary">
              快照没有 Funding USDC 明细；可用金额未知。
            </Text>
          )}
          <Text as="h3" size="base" weight="semibold">
            Spot USDC（不计入买入 Funding）
          </Text>
          {spot ? (
            <DefinitionList
              items={[
                { label: 'Spot 资产', value: spot.asset },
                { label: 'Spot free', value: <DecimalValue value={spot.free} currency={spot.asset} /> },
                { label: 'Spot locked', value: <DecimalValue value={spot.locked} currency={spot.asset} /> },
                { label: 'Spot freeze', value: <DecimalValue value={spot.freeze} currency={spot.asset} /> },
                {
                  label: 'Spot withdrawing',
                  value: <DecimalValue value={spot.withdrawing} currency={spot.asset} />,
                },
              ]}
            />
          ) : (
            <Text as="p" size="sm" color="secondary">
              未保存 Spot USDC 明细；不是零余额。
            </Text>
          )}
        </>
      )}
    </section>
  );
}
