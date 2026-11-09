import { Badge, Banner, Card, MetadataList, MetadataListItem, Text } from '@astryxdesign/core';

const DELIVERED = [
  { label: '构建', value: 'Vite 8 + React 19.3 + TypeScript 5.9' },
  { label: 'UI', value: 'Astryx 0.7.11（唯一主 UI）+ Tailwind CSS v4' },
  { label: '数据', value: 'TanStack Router / Query / Table（服务端分页）' },
  { label: '表单', value: 'React Hook Form 7 + Zod 4 + 自定义金融输入' },
  { label: '测试', value: 'Vitest + RTL + MSW + Playwright（Mock 协议）' },
];

const CONSTRAINTS = [
  '金融数值以字符串流转：不转 Number、不自动钳制、不自动舍入。',
  'UTC 时间保留原始字符串与最多六位小数秒；DST 重复时间必须显式选择。',
  'HTTP 非 2xx 不丢弃 operation 回执；写请求不自动重试。',
  '超时、断网与结构异常按“结果未知”处理，只按原操作标识核对。',
  '表格分页/排序状态只有一个拥有者（服务端语义 + URL/Query）。',
];

export function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Text as="h1" size="lg" weight="semibold">
          前端工程底座
        </Text>
        <Text color="secondary">
          本工程独立于 backend/
          安装、开发、测试与构建；当前只完成技术栈验证与基础组件适配，不连接真实后端，也不执行真实交易。
        </Text>
      </section>

      <Banner
        status="warning"
        title="当前阶段不构成交易界面"
        description="交易写入相关页面必须在前端 P0 门禁完成后另行开发；本页与 Playground 均使用本地 Mock 数据。"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card padding={4}>
          <div className="flex flex-col gap-3">
            <Text as="h2" size="base" weight="semibold">
              已落地能力
            </Text>
            <MetadataList label={{ position: 'start' }}>
              {DELIVERED.map((item) => (
                <MetadataListItem key={item.label} label={item.label}>
                  {item.value}
                </MetadataListItem>
              ))}
            </MetadataList>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex flex-col gap-3">
            <Text as="h2" size="base" weight="semibold">
              必须遵守的约束
            </Text>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {CONSTRAINTS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Badge variant="neutral" label="P0" />
                  <Text size="sm" color="secondary">
                    {item}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Card padding={4}>
        <div className="flex flex-col gap-2">
          <Text as="h2" size="base" weight="semibold">
            开发入口
          </Text>
          <Text size="sm" color="secondary">
            {import.meta.env.DEV
              ? '开发环境已注册 /dev/playground，可在其中逐项操作 Astryx 组件、主题、表单与表格。'
              : '生产构建不注册 /dev/playground；验证页只在开发环境可用。'}
          </Text>
          <Text size="sm" color="secondary">
            常用命令：bun install / bun run dev / bun run typecheck / bun run lint / bun run test:run / bun
            run build。
          </Text>
        </div>
      </Card>
    </div>
  );
}
