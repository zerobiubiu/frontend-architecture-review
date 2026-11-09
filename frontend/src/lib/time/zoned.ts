import {
  formatEpochInZone,
  offsetMinutesAt,
  type UtcInstant,
  utcMillisFromFields,
  utcTextFromFields,
  type WallClockFields,
  zonedFieldsAt,
} from './instant';

export type ZonedResolution =
  | { readonly kind: 'unique'; readonly instant: UtcInstant }
  | { readonly kind: 'nonexistent'; readonly message: string }
  | {
      readonly kind: 'ambiguous';
      readonly candidates: readonly [UtcInstant, UtcInstant];
      readonly message: string;
    };

const ONE_HOUR_MS = 3_600_000;

function sameWall(left: WallClockFields, right: WallClockFields): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

function instantAt(epochMillis: number, fraction: string): UtcInstant {
  const wall = zonedFieldsAt(epochMillis, 'UTC');
  const raw = utcTextFromFields({ ...wall, fraction });
  return { raw, epochMillis, fraction };
}

/**
 * 把“无时区墙钟”解析为 UTC 时刻，并显式处理 DST：
 * - 春季跳变后不存在的墙钟 → `nonexistent`，要求用户换一个时间；
 * - 秋季回拨重复的墙钟 → `ambiguous`，返回两个候选让用户选择，绝不默认取一个。
 *
 * 通过 Intl 读取 IANA tzdata 的真实偏移，不写死 UTC-5/UTC-4。
 * 消歧按 ±1 小时探测，覆盖 America/New_York；其他非整小时跳变时区需另行扩展。
 */
export function resolveZonedWallClock(timeZone: string, wall: WallClockFields): ZonedResolution {
  const naiveMillis = utcMillisFromFields(wall);
  let guess = naiveMillis - offsetMinutesAt(naiveMillis, timeZone) * 60_000;
  for (let step = 0; step < 3; step += 1) {
    const next = naiveMillis - offsetMinutesAt(guess, timeZone) * 60_000;
    if (next === guess) break;
    guess = next;
  }

  if (!sameWall(zonedFieldsAt(guess, timeZone), wall)) {
    return {
      kind: 'nonexistent',
      message: `${timeZone} 在该墙钟时间处于 DST 跳变，时间不存在`,
    };
  }

  const earlier = guess - ONE_HOUR_MS;
  if (sameWall(zonedFieldsAt(earlier, timeZone), wall)) {
    return {
      kind: 'ambiguous',
      candidates: [instantAt(earlier, wall.fraction), instantAt(guess, wall.fraction)],
      message: `${timeZone} 在该墙钟时间发生 DST 回拨，存在两个可能的 UTC 时刻，请明确选择`,
    };
  }

  const later = guess + ONE_HOUR_MS;
  if (sameWall(zonedFieldsAt(later, timeZone), wall)) {
    return {
      kind: 'ambiguous',
      candidates: [instantAt(guess, wall.fraction), instantAt(later, wall.fraction)],
      message: `${timeZone} 在该墙钟时间发生 DST 回拨，存在两个可能的 UTC 时刻，请明确选择`,
    };
  }

  return { kind: 'unique', instant: instantAt(guess, wall.fraction) };
}

/** 形如 `UTC-04:00` 的偏移标签，供 DST 候选并列展示。 */
export function offsetLabel(epochMillis: number, timeZone: string): string {
  const minutes = offsetMinutesAt(epochMillis, timeZone);
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const rest = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${rest}`;
}

/** 同时给出 UTC 与纽约展示，便于输入时交叉核对；不参与序列化。 */
export function describeInstant(instant: UtcInstant): { utc: string; newYork: string } {
  return {
    utc: formatEpochInZone(instant.epochMillis, 'UTC'),
    newYork: formatEpochInZone(instant.epochMillis, 'America/New_York'),
  };
}
