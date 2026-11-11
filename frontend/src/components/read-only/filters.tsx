import { Banner, Button, Selector, TextInput } from '@astryxdesign/core';
import { type FormEvent, type ReactElement, useState } from 'react';

export interface FilterField {
  readonly name: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly options?: readonly { value: string; label: string }[];
}

export interface FilterBarProps {
  readonly fields: readonly FilterField[];
  readonly values: Readonly<Record<string, string>>;
  readonly onApply: (values: Record<string, string>) => string | null;
  readonly onReset: () => void;
  readonly isPending?: boolean;
}

function FilterDraft({ fields, values, onApply, onReset, isPending = false }: FilterBarProps): ReactElement {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...values }));
  const [error, setError] = useState<string | null>(null);

  function updateDraft(name: string, value: string): void {
    setDraft((current) => ({ ...current, [name]: value }));
    setError(null);
  }

  function apply(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending) return;
    const result = onApply({ ...draft });
    setError(typeof result === 'string' ? result : null);
  }

  function reset(): void {
    // 即使 URL 已处于默认值，显式重置也须丢弃尚未应用的草稿。
    setDraft({ ...values });
    setError(null);
    onReset();
  }

  return (
    <search aria-label="只读查询筛选">
      <form aria-busy={isPending} onSubmit={apply} className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {fields.map((field) => (
            <div key={field.name} className="min-w-0 flex-1 basis-48">
              {field.options === undefined ? (
                <TextInput
                  htmlName={field.name}
                  label={field.label}
                  placeholder={field.placeholder}
                  value={draft[field.name] ?? ''}
                  onChange={(value) => updateDraft(field.name, value)}
                  width="100%"
                />
              ) : (
                <Selector
                  htmlName={field.name}
                  label={field.label}
                  placeholder={field.placeholder ?? '不限'}
                  options={[...field.options]}
                  value={draft[field.name] ?? ''}
                  onChange={(value) => updateDraft(field.name, value ?? '')}
                  hasClear
                  width="100%"
                />
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button type="submit" label="查询" variant="primary" isLoading={isPending} />
            <Button type="button" label="重置" variant="secondary" onClick={reset} />
          </div>
        </div>
        {error === null ? null : <Banner status="error" title="无法应用筛选" description={error} />}
      </form>
    </search>
  );
}

export function FilterBar(props: FilterBarProps): ReactElement {
  // 已应用 URL 值才拥有草稿的重置边界；对象引用、字段顺序及查询刷新不会清空编辑。
  const appliedKey = JSON.stringify(
    Object.keys(props.values)
      .sort()
      .map((name) => [name, props.values[name]]),
  );
  return <FilterDraft key={appliedKey} {...props} />;
}
