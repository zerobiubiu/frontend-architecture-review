import { Link } from '@tanstack/react-router';

export const accountLinkClass =
  'break-all underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2';

export function AccountReadLinks({ accountId }: { readonly accountId: string }) {
  return (
    <nav aria-label="当前账户的只读业务页面" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      <Link to="/orders" search={{ accountId }} className={accountLinkClass}>
        本地订单
      </Link>
      <Link to="/tasks" search={{ accountId }} className={accountLinkClass}>
        批量任务
      </Link>
      <Link to="/positions" search={{ accountId }} className={accountLinkClass}>
        名义持仓与官方候选
      </Link>
      <Link to="/trades" search={{ accountId }} className={accountLinkClass}>
        官方成交历史
      </Link>
      <Link to="/ledger" search={{ accountId }} className={accountLinkClass}>
        本地流水
      </Link>
      <Link to="/reconciliations" search={{ accountId }} className={accountLinkClass}>
        已存核对记录
      </Link>
      <Link to="/securities" search={{ accountId }} className={accountLinkClass}>
        官方证券目录
      </Link>
      <Link to="/market" search={{ accountId }} className={accountLinkClass}>
        单证券报价
      </Link>
    </nav>
  );
}
