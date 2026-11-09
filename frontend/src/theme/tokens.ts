/**
 * Astryx CSS 变量的类型化引用。
 *
 * 这里只做“变量名 → var(--…)”映射，供无法使用 Tailwind 工具类的 TS 代码（图表、Canvas、导出等）
 * 读取同一套主题数值；不新增颜色、圆角或字体数值，避免出现第二份 Token 来源。
 */
export const tokens = {
  color: {
    body: 'var(--color-background-body)',
    surface: 'var(--color-background-surface)',
    card: 'var(--color-background-card)',
    border: 'var(--color-border)',
    borderEmphasized: 'var(--color-border-emphasized)',
    textPrimary: 'var(--color-text-primary)',
    textSecondary: 'var(--color-text-secondary)',
    textDisabled: 'var(--color-text-disabled)',
    textError: 'var(--color-text-error)',
    textSuccess: 'var(--color-text-success)',
    textWarning: 'var(--color-text-warning)',
    accent: 'var(--color-accent)',
    onAccent: 'var(--color-on-accent)',
  },
  radius: {
    none: 'var(--radius-none)',
    inner: 'var(--radius-inner)',
    element: 'var(--radius-element)',
    container: 'var(--radius-container)',
    page: 'var(--radius-page)',
    full: 'var(--radius-full)',
  },
  shadow: {
    low: 'var(--shadow-low)',
    medium: 'var(--shadow-med)',
    high: 'var(--shadow-high)',
  },
  motion: {
    fast: 'var(--duration-fast)',
    medium: 'var(--duration-medium)',
    slow: 'var(--duration-slow)',
  },
  typography: {
    bodyFamily: 'var(--font-family-body)',
    headingFamily: 'var(--font-family-heading)',
    codeFamily: 'var(--font-family-code)',
  },
} as const;
