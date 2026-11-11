import {
  Button,
  type InputStatus,
  RadioList,
  RadioListItem,
  SegmentedControl,
  SegmentedControlItem,
  Text,
  TextInput,
} from '@astryxdesign/core';
import { type Ref, useEffect, useId, useMemo, useRef, useState } from 'react';
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

export interface FieldEditingState {
  /** 当前编辑是否可以进入表单提交；false 时父表单必须阻止提交。 */
  readonly valid: boolean;
  readonly reason: string | null;
}

export interface UtcDateTimeFieldProps {
  readonly label: string;
  /** 权威值：UTC 字符串，原样保留小数秒位数。 */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /**
   * 编辑有效性协议：纽约草稿格式错误、春季不存在、秋季未选择候选时为 false。
   * 父表单必须把它接入提交校验，而不是只展示错误文字。
   */
  readonly onEditingStateChange?: (state: FieldEditingState) => void;
  /** 外部重置标记（如 RHF reset）；变化时按当前 UTC 值重建草稿。 */
  readonly resetToken?: number;
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
 * - 主输入为 UTC 文本（`YYYY-MM-DDTHH:mm:ss[.ffffff]Z`），最多六位有效小数秒，超出直接报错；
 * - 原串就是表单值，展示与提交都不经过 Date 往返；
 * - 可切换到纽约墙钟输入：春季不存在时间拒绝提交，秋季重复时间必须显式选择候选时刻；
 * - 纽约草稿的无效/未决状态通过 `onEditingStateChange` 通知父表单，不能静默提交旧 UTC；
 * - 展示行同时给出 UTC 与 America/New_York，仅用于核对，不回写。
 */
export function UtcDateTimeField({
  label,
  value,
  onChange,
  onEditingStateChange,
  resetToken,
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
  const lastSyncedValue = useRef(value);
  const notifyRef = useRef(onEditingStateChange);
  notifyRef.current = onEditingStateChange;
  const locked = Boolean(isDisabled || isReadOnly);

  const parsed = parseUtcInstant(value);
  const internalStatus: InputStatus | undefined =
    value.length > 0 && !parsed.ok ? { type: 'error', message: parsed.message } : undefined;
  const effectiveStatus = status ?? internalStatus;
  const zonedInputStatus: InputStatus | undefined =
    zoned.kind === 'invalid' || zoned.kind === 'nonexistent'
      ? { type: 'error', message: zoned.message ?? '' }
      : status;
  const preview = parsed.ok
    ? `UTC ${formatInstantInZone(parsed.value, TIME_ZONES.utc)} · 纽约 ${formatInstantInZone(
        parsed.value,
        TIME_ZONES.newYork,
      )}`
    : null;

  const nyDraftResolvedValue = useMemo(() => {
    if (nyDraft.length === 0) return null;
    const wall = parseWallClockText(nyDraft);
    if (!wall.ok) return null;
    const resolution = resolveZonedWallClock(TIME_ZONES.newYork, wall.value);
    return resolution.kind === 'unique' ? resolution.instant.raw : null;
  }, [nyDraft]);

  // 外部 value / reset 变化时重建纽约草稿，避免旧草稿与新表单值脱节。
  useEffect(() => {
    if (value === lastSyncedValue.current) return;
    lastSyncedValue.current = value;
    const next = parseUtcInstant(value);
    setZoned(IDLE);
    if (mode === 'newYork') {
      setNyDraft(next.ok ? formatInstantInZone(next.value, TIME_ZONES.newYork) : '');
    }
  }, [value, mode]);

  useEffect(() => {
    if (resetToken === undefined) return;
    const next = parseUtcInstant(value);
    lastSyncedValue.current = value;
    setZoned(IDLE);
    if (mode === 'newYork') {
      setNyDraft(next.ok ? formatInstantInZone(next.value, TIME_ZONES.newYork) : '');
    }
  }, [resetToken, mode, value]);

  const editing = useMemo<FieldEditingState>(() => {
    if (mode === 'utc') return { valid: true, reason: null };
    if (nyDraft.length === 0) return { valid: true, reason: null };
    if (zoned.kind === 'invalid' || zoned.kind === 'nonexistent') {
      return { valid: false, reason: zoned.message };
    }
    if (zoned.kind === 'ambiguous') {
      const selected = zoned.candidates.some((candidate) => candidate.raw === value);
      return selected
        ? { valid: true, reason: null }
        : { valid: false, reason: '请选择 DST 重复时刻后再提交' };
    }
    return { valid: true, reason: null };
  }, [mode, nyDraft, zoned, value]);

  useEffect(() => {
    notifyRef.current?.(editing);
  }, [editing]);

  const applyNewYorkDraft = (text: string) => {
    setNyDraft(text);
    if (text.length === 0) {
      setZoned(IDLE);
      onChange('');
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
    lastSyncedValue.current = resolution.instant.raw;
    onChange(resolution.instant.raw);
  };

  const switchMode = (next: InputMode) => {
    setMode(next);
    setZoned(IDLE);
    if (next === 'newYork') {
      const current = parseUtcInstant(value);
      setNyDraft(current.ok ? formatInstantInZone(current.value, TIME_ZONES.newYork) : '');
    } else {
      setNyDraft('');
    }
  };

  const clearValue = () => {
    setNyDraft('');
    setZoned(IDLE);
    lastSyncedValue.current = '';
    onChange('');
  };

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label={`${label}的输入时区`}
        size="sm"
        value={mode}
        isDisabled={locked}
        onChange={(next) => {
          if (next === 'utc' || next === 'newYork') switchMode(next);
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
          ref={ref}
          label={`${label}（America/New_York 墙钟）`}
          description="格式 YYYY-MM-DD HH:mm:ss[.ffffff]；会据此换算为 UTC，并显式处理 DST。"
          status={zonedInputStatus}
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

      {mode === 'newYork' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            label="清空时间"
            size="sm"
            variant="ghost"
            isDisabled={locked}
            onClick={clearValue}
            data-testid="utc-datetime-clear"
          />
          {nyDraft.length > 0 && nyDraftResolvedValue === null ? (
            <Text size="sm" color="secondary" data-testid="utc-datetime-editing-state">
              当前纽约草稿尚未形成可提交的 UTC 时间
            </Text>
          ) : null}
        </div>
      ) : null}

      {zoned.kind === 'ambiguous' ? (
        <div aria-live="polite" className="flex flex-col gap-2" data-testid="dst-ambiguous">
          <Text size="sm" color="secondary">
            {zoned.message}
          </Text>
          <RadioList
            label="选择 DST 重复时刻"
            isDisabled={locked}
            value={zoned.candidates.some((candidate) => candidate.raw === value) ? value : ''}
            onChange={(raw) => {
              const candidate = zoned.candidates.find((item) => item.raw === raw);
              if (candidate) {
                setZoned({ kind: 'resolved', message: null, candidates: [] });
                lastSyncedValue.current = candidate.raw;
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
