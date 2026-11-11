import { Text } from '@astryxdesign/core';
import type { ReactNode } from 'react';

interface DefinitionListProps {
  readonly items: readonly { readonly label: string; readonly value: ReactNode }[];
}

export function DefinitionList({ items }: DefinitionListProps) {
  return (
    <dl className="grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label} className="flex min-w-0 flex-col gap-1">
          <dt>
            <Text size="sm" color="secondary">
              {label}
            </Text>
          </dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const MAX_JSON_CHARACTERS = 6_000;
const MAX_JSON_ENTRIES = 100;
const MAX_JSON_DEPTH = 6;
const TRUNCATED_VALUE = '[已截断]';

function jsonPreview(value: unknown): { readonly text: string; readonly truncated: boolean } {
  let remaining = MAX_JSON_ENTRIES;
  let truncated = false;
  function project(entry: unknown, depth: number): unknown {
    if (typeof entry === 'string') {
      if (entry.length <= MAX_JSON_CHARACTERS) return entry;
      truncated = true;
      return `${entry.slice(0, MAX_JSON_CHARACTERS)}…`;
    }
    if (entry === null || typeof entry === 'boolean') return entry;
    if (typeof entry === 'number') return Number.isFinite(entry) ? entry : '[非有限数值，未展示]';
    if (entry instanceof Error) return '[错误对象未展示]';
    if (typeof entry !== 'object') return '[非 JSON 值，未展示]';
    if (depth >= MAX_JSON_DEPTH) {
      truncated = true;
      return TRUNCATED_VALUE;
    }
    if (Array.isArray(entry)) {
      const result: unknown[] = [];
      for (const child of entry) {
        if (remaining === 0) {
          truncated = true;
          break;
        }
        remaining -= 1;
        result.push(project(child, depth + 1));
      }
      return result;
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, child] of Object.entries(entry)) {
      if (remaining === 0) {
        truncated = true;
        break;
      }
      remaining -= 1;
      if (key.length > MAX_JSON_CHARACTERS) {
        truncated = true;
        continue;
      }
      result[key] = project(child, depth + 1);
    }
    return result;
  }
  const text = JSON.stringify(project(value, 0), null, 2);
  return {
    text: text.slice(0, MAX_JSON_CHARACTERS),
    truncated: truncated || text.length > MAX_JSON_CHARACTERS,
  };
}

interface JsonDetailsProps {
  readonly value: unknown;
  readonly title?: string;
}

/** 只展示已挑选的公开附加字段；不是响应、操作身份、回执 raw 或网络错误的通用查看器。 */
export function JsonDetails({ value, title = '附加字段（JSON）' }: JsonDetailsProps) {
  const preview = jsonPreview(value);
  return (
    <details className="min-w-0 text-sm">
      <summary className="min-h-6 cursor-pointer py-1 font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
        {title}
      </summary>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">
        <code>{preview.text}</code>
      </pre>
      {preview.truncated ? (
        <p role="note">
          <Text size="sm" color="secondary">
            已截断，仅显示附加字段片段，并非完整数据。
          </Text>
        </p>
      ) : null}
    </details>
  );
}
