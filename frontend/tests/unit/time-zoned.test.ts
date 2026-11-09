import { describe, expect, it } from 'vitest';
import type { WallClockFields } from '@/lib/time/instant';
import { describeInstant, offsetLabel, resolveZonedWallClock } from '@/lib/time/zoned';

const NEW_YORK = 'America/New_York';

function wall(text: string, fraction = ''): WallClockFields {
  const [datePart = '', timePart = ''] = text.split(' ');
  const [year = 0, month = 0, day = 0] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number);
  return { year, month, day, hour, minute, second, fraction };
}

describe('DST 墙钟解析（America/New_York）', () => {
  it('冬季与夏季唯一时刻换算正确', () => {
    const winter = resolveZonedWallClock(NEW_YORK, wall('2026-01-15 12:00:00'));
    expect(winter.kind).toBe('unique');
    if (winter.kind === 'unique') expect(winter.instant.raw).toBe('2026-01-15T17:00:00Z');

    const summer = resolveZonedWallClock(NEW_YORK, wall('2026-07-01 12:00:00'));
    expect(summer.kind).toBe('unique');
    if (summer.kind === 'unique') expect(summer.instant.raw).toBe('2026-07-01T16:00:00Z');
  });

  it('春季跳变的不存在时刻被拒绝', () => {
    const resolution = resolveZonedWallClock(NEW_YORK, wall('2026-03-08 02:30:00'));
    expect(resolution.kind).toBe('nonexistent');
  });

  it('春季跳变前后边界仍然可解析', () => {
    const before = resolveZonedWallClock(NEW_YORK, wall('2026-03-08 01:59:59'));
    expect(before.kind).toBe('unique');
    if (before.kind === 'unique') expect(before.instant.raw).toBe('2026-03-08T06:59:59Z');

    const after = resolveZonedWallClock(NEW_YORK, wall('2026-03-08 03:00:00'));
    expect(after.kind).toBe('unique');
    if (after.kind === 'unique') expect(after.instant.raw).toBe('2026-03-08T07:00:00Z');
  });

  it('秋季回拨的重复时刻返回两个候选，并要求显式选择', () => {
    const resolution = resolveZonedWallClock(NEW_YORK, wall('2026-11-01 01:30:00', '123456'));
    expect(resolution.kind).toBe('ambiguous');
    if (resolution.kind === 'ambiguous') {
      expect(resolution.candidates.map((candidate) => candidate.raw)).toEqual([
        '2026-11-01T05:30:00.123456Z',
        '2026-11-01T06:30:00.123456Z',
      ]);
      expect(offsetLabel(resolution.candidates[0].epochMillis, NEW_YORK)).toBe('UTC-04:00');
      expect(offsetLabel(resolution.candidates[1].epochMillis, NEW_YORK)).toBe('UTC-05:00');
    }
  });

  it('回拨后的 02:00 恢复唯一（EST）', () => {
    const resolution = resolveZonedWallClock(NEW_YORK, wall('2026-11-01 02:00:00'));
    expect(resolution.kind).toBe('unique');
    if (resolution.kind === 'unique') expect(resolution.instant.raw).toBe('2026-11-01T07:00:00Z');
  });

  it('同时给出 UTC 与纽约展示', () => {
    const resolution = resolveZonedWallClock(NEW_YORK, wall('2026-01-15 09:30:00'));
    expect(resolution.kind).toBe('unique');
    if (resolution.kind === 'unique') {
      expect(describeInstant(resolution.instant)).toEqual({
        utc: '2026-01-15 14:30:00',
        newYork: '2026-01-15 09:30:00',
      });
    }
  });
});
