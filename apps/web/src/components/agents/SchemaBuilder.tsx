'use client';

import { useState } from 'react';
import type { SchemaField, PromptSchema } from '@brighttale/shared';
import { buildSchemaExample } from '@brighttale/shared';

const FIELD_TYPES: SchemaField['type'][] = ['string', 'number', 'boolean', 'array', 'object'];
const ITEMS_TYPES = ['string', 'number', 'boolean', 'object'] as const;

interface SchemaBuilderProps {
  schema: PromptSchema;
  onChange: (schema: PromptSchema) => void;
}

export function SchemaBuilder({ schema, onChange }: SchemaBuilderProps) {
  const preview = buildSchemaExample(schema.fields);

  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Schema Name</label>
          <input
            value={schema.name}
            onChange={(e) => onChange({ ...schema, name: e.target.value })}
            placeholder="e.g. BC_BLOG_INPUT"
            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono"
          />
        </div>

        <FieldList
          fields={schema.fields}
          onChange={(fields) => onChange({ ...schema, fields })}
          depth={0}
        />
      </div>

      <div className="w-80 shrink-0">
        <div className="sticky top-4">
          <h4 className="text-sm font-medium mb-2">JSON Preview</h4>
          <pre className="p-3 rounded-md border bg-muted/30 text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
            {preview}
          </pre>
        </div>
      </div>
    </div>
  );
}

function FieldList({
  fields,
  onChange,
  depth,
}: {
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
  depth: number;
}) {
  function addField() {
    onChange([
      ...fields,
      { name: '', type: 'string', required: false, description: '' },
    ]);
  }

  function updateField(index: number, updated: SchemaField) {
    const next = [...fields];
    next[index] = updated;
    onChange(next);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {fields.map((field, i) => (
        <FieldRow
          key={i}
          field={field}
          onChange={(f) => updateField(i, f)}
          onRemove={() => removeField(i)}
          onMoveUp={() => moveField(i, -1)}
          onMoveDown={() => moveField(i, 1)}
          isFirst={i === 0}
          isLast={i === fields.length - 1}
          depth={depth}
        />
      ))}
      {depth < 3 && (
        <button
          onClick={addField}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
        >
          + Add field
        </button>
      )}
    </div>
  );
}

function FieldRow({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  depth,
}: {
  field: SchemaField;
  onChange: (f: SchemaField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (field.type === 'array' && field.items?.type === 'object') || field.type === 'object';

  return (
    <div className={`border rounded-md ${depth > 0 ? 'ml-6 border-dashed' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        {hasChildren && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground">
            {expanded ? '▼' : '▶'}
          </button>
        )}
        <input
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          placeholder="field_name"
          className="w-36 px-2 py-1 rounded border bg-background text-sm font-mono"
        />
        <select
          value={field.type}
          onChange={(e) => {
            const type = e.target.value as SchemaField['type'];
            const updated: SchemaField = { ...field, type };
            if (type === 'object' && !updated.fields) updated.fields = [];
            if (type === 'array' && !updated.items) updated.items = { type: 'string' };
            if (type !== 'object') delete updated.fields;
            if (type !== 'array') delete updated.items;
            onChange(updated);
          }}
          className="w-24 px-2 py-1 rounded border bg-background text-sm"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
          />
          req
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={onMoveUp} disabled={isFirst} className="text-xs px-1 disabled:opacity-30">&uarr;</button>
          <button onClick={onMoveDown} disabled={isLast} className="text-xs px-1 disabled:opacity-30">&darr;</button>
          <button onClick={onRemove} className="text-xs text-destructive px-1">&#x2715;</button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <input
            value={field.description}
            onChange={(e) => onChange({ ...field, description: e.target.value })}
            placeholder="Description"
            className="w-full px-2 py-1 rounded border bg-background text-xs"
          />

          {field.type === 'array' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Items type:</span>
                <select
                  value={field.items?.type ?? 'string'}
                  onChange={(e) => {
                    const itemType = e.target.value as 'string' | 'number' | 'boolean' | 'object';
                    const items = itemType === 'object'
                      ? { type: itemType, fields: field.items?.fields ?? [] }
                      : { type: itemType };
                    onChange({ ...field, items });
                  }}
                  className="px-2 py-1 rounded border bg-background text-xs"
                >
                  {ITEMS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {field.items?.type === 'object' && depth < 2 && (
                <FieldList
                  fields={field.items.fields ?? []}
                  onChange={(fields) => onChange({ ...field, items: { ...field.items, type: 'object', fields } })}
                  depth={depth + 1}
                />
              )}
            </div>
          )}

          {field.type === 'object' && depth < 2 && (
            <FieldList
              fields={field.fields ?? []}
              onChange={(fields) => onChange({ ...field, fields })}
              depth={depth + 1}
            />
          )}
        </div>
      )}
    </div>
  );
}
