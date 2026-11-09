import {
  InputGroup,
  InputGroupText,
  type InputStatus,
  type SizeValue,
  TextInput,
  type TextInputType,
} from '@astryxdesign/core';
import type { ReactNode, Ref } from 'react';

export interface DecimalTextInputProps {
  readonly label: string;
  /** 字符串值：价格、股数、本金一律以原始字符串流转。 */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly ref?: Ref<HTMLInputElement>;
  readonly description?: string;
  /** 前缀（如币种）与后缀（如单位），仅作展示，不参与取值。 */
  readonly prefix?: ReactNode;
  readonly suffix?: ReactNode;
  /** 外部（Zod / 服务端）错误优先展示；组件自身不做数值钳制或舍入。 */
  readonly status?: InputStatus;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
  readonly isRequired?: boolean;
  readonly isOptional?: boolean;
  readonly placeholder?: string;
  readonly type?: TextInputType;
  readonly inputMode?: 'decimal' | 'numeric' | 'text';
  readonly width?: SizeValue;
  readonly htmlName?: string;
  readonly onEnter?: () => void;
}

/**
 * 金融十进制文本输入。
 *
 * 设计约束（P0-008）：
 * - 值始终是字符串，不做 Number 转换、不自动钳制、不自动舍入；
 * - 允许输入中间态（如 `12.`），是否合法由 Zod 校验决定；
 * - 错误只通过 `status` 呈现，不在输入过程中改写用户输入。
 */
export function DecimalTextInput({
  label,
  value,
  onChange,
  onBlur,
  ref,
  description,
  prefix,
  suffix,
  status,
  isDisabled,
  isReadOnly,
  isRequired,
  isOptional,
  placeholder,
  type = 'text',
  inputMode = 'decimal',
  width,
  htmlName,
  onEnter,
}: DecimalTextInputProps) {
  const hasAffix = prefix !== undefined || suffix !== undefined;
  const input = (
    <TextInput
      ref={ref}
      // 组合模式由 InputGroup 提供唯一标签，避免可访问名重复成“本金 本金”。
      label={hasAffix ? '' : label}
      isLabelHidden={hasAffix}
      description={hasAffix ? undefined : description}
      status={status}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      isOptional={isOptional}
      placeholder={placeholder}
      type={type}
      inputMode={inputMode}
      width={width}
      htmlName={htmlName}
      onEnter={onEnter}
      hasSpellCheck={false}
      autoComplete="off"
    />
  );

  if (!hasAffix) return input;

  return (
    <InputGroup
      label={label}
      description={description}
      status={status}
      isDisabled={isDisabled}
      isRequired={isRequired}
      isOptional={isOptional}
      data-testid="decimal-text-input-group"
    >
      {prefix === undefined ? null : <InputGroupText>{prefix}</InputGroupText>}
      {input}
      {suffix === undefined ? null : <InputGroupText>{suffix}</InputGroupText>}
    </InputGroup>
  );
}
