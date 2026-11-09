import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core';
import { type ThemeMode, useThemeMode } from '@/app/providers/theme-provider';

const MODES: readonly { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

export function ThemeModeToggle() {
  const { mode, setMode } = useThemeMode();
  return (
    <SegmentedControl
      label="主题模式"
      size="sm"
      value={mode}
      onChange={(value) => {
        const next = MODES.find((item) => item.value === value);
        if (next) setMode(next.value);
      }}
    >
      {MODES.map((item) => (
        <SegmentedControlItem key={item.value} value={item.value} label={item.label} />
      ))}
    </SegmentedControl>
  );
}
