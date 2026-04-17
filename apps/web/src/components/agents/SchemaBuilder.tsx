'use client';

import { useState } from 'react';
import type { SchemaField, PromptSchema } from '@brighttale/shared';
import { buildSchemaExample } from '@brighttale/shared';
import { inferSchemaFromJson } from './inferSchemaFromJson';

const FIELD_TYPES: SchemaField['type'][] = ['string', 'number', 'boolean', 'array', 'object'];
const ITEMS_TYPES = ['string', 'number', 'boolean', 'object'] as const;

interface FieldError {
  path: string;
  message: string;
}

export interface SchemaBuilderProps {
  schema: PromptSchema;
  onChange: (schema: PromptSchema) => void;
  /** Optional: inline errors keyed by path like "fields[0].name" */
  errors?: FieldError[];
}

export function SchemaBuilder({ schema, onChange, errors = [] }: SchemaBuilderProps) {
  const [nameLocked, setNameLocked] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const preview = buildSchemaExample(schema.fields);
  const nameError = errors.find((e) => e.path === 'name')?.message;

  function handleUnlock() {
    const ok = window.confirm(
      'Schema names are contract identifiers (e.g. BC_BLOG_OUTPUT). Renaming may break runtime parsers that rely on exact matches. Continue?',
    );
    if (ok) setNameLocked(false);
  }

  function handleImport(json: unknown) {
    const fields = inferSchemaFromJson(json);
    if (fields.length === 0) {
      window.alert('Could not infer any fields. Paste a JSON object (not array or primitive).');
      return;
    }
    onChange({ ...schema, fields });
    setImportOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Schema Name</label>
        <div className="flex items-center gap-2">
          <input
            value={schema.name}
            onChange={(e) => onChange({ ...schema, name: e.target.value })}
            disabled={nameLocked}
            placeholder="e.g. BC_BLOG_INPUT"
            className={`flex-1 px-3 py-2 rounded-md border bg-background text-sm font-mono disabled:opacity-60 ${
              nameError ? 'border-destructive' : ''
            }`}
          />
          {nameLocked ? (
            <button
              onClick={handleUnlock}
              type="button"
              className="px-3 py-2 rounded-md border text-xs hover:bg-muted/50"
              title="Unlock to edit contract identifier"
            >
              Edit
            </button>
          ) : (
            <button
              onClick={() => setNameLocked(true)}
              type="button"
              className="px-3 py-2 rounded-md border text-xs hover:bg-muted/50"
            >
              Lock
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            type="button"
            className="px-3 py-2 rounded-md border text-xs hover:bg-muted/50"
            title="Infer schema from a JSON sample"
          >
            Import JSON
          </button>
        </div>
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-2">
          <FieldList
            fields={schema.fields}
            onChange={(fields) => onChange({ ...schema, fields })}
            depth={0}
            path="fields"
            errors={errors}
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

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImport={handleImport} />}
    </div>
  );
}

function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (json: unknown) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function handleParse() {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('Expected a JSON object at the top level.');
        return;
      }
      onImport(parsed);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-background border rounded-lg p-5 max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">Import schema from JSON sample</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Paste a JSON object showing the shape you want. Field names become schema fields,
          nested objects become sub-schemas, arrays become array fields. Descriptions will be empty.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'{\n  "title": "",\n  "score": 0,\n  "tags": ["example"]\n}'}
          className="flex-1 min-h-64 px-3 py-2 rounded-md border bg-muted/20 text-xs font-mono resize-none"
          autoFocus
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} type="button" className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50">
            Cancel
          </button>
          <button
            onClick={handleParse}
            type="button"
            disabled={!text.trim()}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldList({
  fields,
  onChange,
  depth,
  path,
  errors,
}: {
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
  depth: number;
  path: string;
  errors: FieldError[];
}) {
  function addField() {
    onChange([...fields, { name: '', type: 'string', required: false, description: '' }]);
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
          path={`${path}[${i}]`}
          errors={errors}
        />
      ))}
      {depth < 3 && (
        <button
          onClick={addField}
          type="button"
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
  path,
  errors,
}: {
  field: SchemaField;
  onChange: (f: SchemaField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  depth: number;
  path: string;
  errors: FieldError[];
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (field.type === 'array' && field.items?.type === 'object') || field.type === 'object';
  const nameError = errors.find((e) => e.path === `${path}.name`)?.message;

  return (
    <div className={`border rounded-md ${depth > 0 ? 'ml-6 border-dashed' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            type="button"
            className="text-xs text-muted-foreground w-4"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <input
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          placeholder="field_name"
          className={`w-36 px-2 py-1 rounded border bg-background text-sm font-mono ${
            nameError ? 'border-destructive' : ''
          }`}
          title={nameError}
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
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
          />
          required
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={onMoveUp} type="button" disabled={isFirst} className="text-xs px-1 disabled:opacity-30" title="Move up">↑</button>
          <button onClick={onMoveDown} type="button" disabled={isLast} className="text-xs px-1 disabled:opacity-30" title="Move down">↓</button>
          <button onClick={onRemove} type="button" className="text-xs text-destructive px-1" title="Remove field">×</button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <input
            value={field.description}
            onChange={(e) => onChange({ ...field, description: e.target.value })}
            placeholder="Description (what this field represents, expected format, etc.)"
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
                  path={`${path}.items.fields`}
                  errors={errors}
                />
              )}
            </div>
          )}

          {field.type === 'object' && depth < 2 && (
            <FieldList
              fields={field.fields ?? []}
              onChange={(fields) => onChange({ ...field, fields })}
              depth={depth + 1}
              path={`${path}.fields`}
              errors={errors}
            />
          )}
        </div>
      )}
    </div>
  );
}
