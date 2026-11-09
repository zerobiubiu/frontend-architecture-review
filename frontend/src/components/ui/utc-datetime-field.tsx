import {
  type InputStatus,
  RadioList,
  RadioListItem,
  SegmentedControl,
  SegmentedControlItem,
  Text,
  TextInput,
} from '@astryxdesign/core';
import { type Ref, useId, useState } from 'react';
import {
  formatInstantInZone,
  parseUtcInstant,
  parseWallClockText,
  TIME_ZONES,
  type UtcInstant,
} from '@/lib/time/instant';
import { offsetLabel, resolveZonedWallClock } from '@/lib/time/zoned';

type InputMode = 'utc' | 'newYork';

interface ZonedState {
  readonly kind: 'idle' | 'invalid' | 'nonexistent' | 'ambiguous' | 'resolved';
  readonly message: string | null;
  readonly candidates: readonly UtcInstant[];
}

const IDLE: ZonedState = { kind: 'idle', message: null, candidates: [] };

export interface UtcDateTimeFieldProps {
  readonly label: string;
  /** 权威值：UTC 字符串，原样保留小数秒位数。 */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly ref?: Ref<HTMLInputElement>;
  readonly description?: string;
  /** 外部（Zod / 服务端）错误优先展示。 */
  readonly status?: InputStatus;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
  readonly isRequired?: boolean;
  readonly placeholder?: string;
}

/**
 * 精确 UTC 时间输入。
 *
 * - 主输入为 UTC 文本（`YYYY-MM-DDTHH:mm:ss[.ffffff]Z`），最多六位小数秒，超出直接报错；
 * - 原串就是表单值，展示与提交都不经过 Date 往返；
 * - 可切换到纽约墙钟输入：春季不存在时间拒绝提交，秋季重复时间必须显式选择候选时刻；
 * - 展示行同时给出 UTC 与 America/New_York，仅用于核对，不回写。
 */
export function UtcDateTimeField({
  label,
  value,
  onChange,
  onBlur,
  ref,
  description,
  status,
  isDisabled,
  isReadOnly,
  isRequired,
  placeholder = '2026-01-15T14:30:00.123456Z',
}: UtcDateTimeFieldProps) {
  const [mode, setMode] = useState<InputMode>('utc');
  const [nyDraft, setNyDraft] = useState('');
  const [zoned, setZoned] = useState<ZonedState>(IDLE);
  const descriptionId = useId();

  const parsed = parseUtcInstant(value);
  const internalStatus: InputStatus | undefined =
    value.length > 0 && !parsed.ok ? { type: 'error', message: parsed.message } : undefined;
  const effectiveStatus = status ?? internalStatus;
  const preview = parsed.ok
    ? `UTC ${formatInstantInZone(parsed.value, TIME_ZONES.utc)} · 纽约 ${formatInstantInZone(
        parsed.value,
        TIME_ZONES.newYork,
      )}`
    : null;

  const applyNewYorkDraft = (text: string) => {
    setNyDraft(text);
    if (text.length === 0) {
      setZoned(IDLE);
      return;
    }
    const wall = parseWallClockText(text);
    if (!wall.ok) {
      setZoned({ kind: 'invalid', message: wall.message, candidates: [] });
      return;
    }
    const resolution = resolveZonedWallClock(TIME_ZONES.newYork, wall.value);
    if (resolution.kind === 'nonexistent') {
      setZoned({ kind: 'nonexistent', message: resolution.message, candidates: [] });
      return;
    }
    if (resolution.kind === 'ambiguous') {
      setZoned({ kind: 'ambiguous', message: resolution.message, candidates: resolution.candidates });
      return;
    }
    setZoned({ kind: 'resolved', message: null, candidates: [] });
    onChange(resolution.instant.raw);
  };

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label={`${label}的输入时区`}
        size="sm"
        value={mode}
        onChange={(next) => {
          if (next === 'utc' || next === 'newYork') {
            setMode(next);
            setZoned(IDLE);
          }
        }}
      >
        <SegmentedControlItem value="utc" label="UTC" />
        <SegmentedControlItem value="newYork" label="纽约时间" />
      </SegmentedControl>

      {mode === 'utc' ? (
        <TextInput
          ref={ref}
          label={label}
          description={description}
          status={effectiveStatus}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          isRequired={isRequired}
          placeholder={placeholder}
          inputMode="text"
          hasSpellCheck={false}
          autoComplete="off"
          htmlName="utcDateTime"
          data-testid="utc-datetime-input"
        />
      ) : (
        <TextInput
          label={`${label}（America/New_York 墙钟）`}
          description="格式 YYYY-MM-DD HH:mm:ss[.ffffff]；会据此换算为 UTC，并显式处理 DST。"
          status={
            zoned.kind === 'invalid' || zoned.kind === 'nonexistent'
              ? { type: 'error', message: zoned.message ?? '' }
              : undefined
          }
          value={nyDraft}
          onChange={applyNewYorkDraft}
          onBlur={onBlur}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          isRequired={isRequired}
          placeholder="2026-01-15 09:30:00"
          inputMode="text"
          hasSpellCheck={false}
          autoComplete="off"
          data-testid="new-york-datetime-input"
        />
      )}

      {zoned.kind === 'ambiguous' ? (
        <div aria-live="polite" className="flex flex-col gap-2" data-testid="dst-ambiguous">
          <Text size="sm" color="secondary">
            {zoned.message}
          </Text>
          <RadioList
            label="选择 DST 重复时刻"
            value={zoned.candidates.some((candidate) => candidate.raw === value) ? value : ''}
            onChange={(raw) => {
              const candidate = zoned.candidates.find((item) => item.raw === raw);
              if (candidate) {
                setZoned({ kind: 'resolved', message: null, candidates: [] });
                onChange(candidate.raw);
              }
            }}
          >
            {zoned.candidates.map((candidate, index) => (
              <RadioListItem
                key={candidate.raw}
                value={candidate.raw}
                label={`${candidate.raw}（${offsetLabel(candidate.epochMillis, TIME_ZONES.newYork)}，${
                  index === 0 ? '较早' : '较晚'
                }）`}
              />
            ))}
          </RadioList>
        </div>
      ) : null}

      {preview ? (
        <Text size="sm" color="secondary" id={descriptionId} data-testid="utc-datetime-preview">
          {preview}
        </Text>
      ) : (
        <Text size="sm" color="secondary" id={descriptionId}>
          未设置有效时间
        </Text>
      )}
    </div>
  );
}
