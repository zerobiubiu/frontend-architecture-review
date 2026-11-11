import { Banner } from '@astryxdesign/core';

export const PROTOCOL_STUB_MODE = import.meta.env.DEV && import.meta.env.VITE_PROTOCOL_STUB === '1';

export function ProtocolModeBanner() {
  return (
    <Banner
      status="warning"
      title="Mock · 本地协议桩"
      description="当前连接无交易能力的测试协议桩，不是后端联调或真实业务数据。"
    />
  );
}
