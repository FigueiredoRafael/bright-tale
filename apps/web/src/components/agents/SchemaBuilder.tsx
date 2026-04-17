'use client';

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, ChevronUp, Lock, Unlock, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import type { SchemaField, PromptSchema } from '@brighttale/shared';
import { buildSchemaExample } from '@brighttale/shared';
import { inferSchemaFromJson } from './inferSchemaFromJson';

const FIELD_TYPES: SchemaField['type'][] = ['string', 'number', 'boolean', 'array', 'object'];
const ITEMS_TYPES = ['string', 'number', 'boolean', 'object'] as const;

const TYPE_BADGE: Record<SchemaField['type'], string> = {
  string: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  number: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  boolean: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
  array: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  object: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
};

interface FieldError {
  path: string;
  message: string;
}

export interface SchemaBuilderProps {
  schema: PromptSchema;
  onChange: (schema: PromptSchema) => void;
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
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Schema Name
            <span className="normal-case text-muted-foreground/70 font-normal ml-1">(contract id)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              value={schema.name}
              onChange={(e) => onChange({ ...schema, name: e.target.value })}
              disabled={nameLocked}
              placeholder="e.g. BC_BLOG_INPUT"
              className={`flex-1 px-3 py-2 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40 disabled:opacity-60 ${
                nameError ? 'border-destructive' : 'border-border'
              }`}
            />
            {nameLocked ? (
              <button
                onClick={handleUnlock}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                title="Unlock to edit contract identifier"
              >
                <Lock size={12} /> Edit
              </button>
            ) : (
              <button
                onClick={() => setNameLocked(true)}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2DD4A8]/30 text-xs text-[#2DD4A8] hover:bg-[rgba(45,212,168,0.08)] transition-colors"
              >
                <Unlock size={12} /> Lock
              </button>
            )}
            <button
              onClick={() => setImportOpen(true)}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              title="Infer schema from a JSON sample"
            >
              <Sparkles size={12} /> Import JSON
            </button>
          </div>
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>

        <FieldList
          fields={schema.fields}
          onChange={(fields) => onChange({ ...schema, fields })}
          depth={0}
          path="fields"
          errors={errors}
        />
      </div>

      {schema.fields.length > 0 && (
        <details className="rounded-xl border border-border bg-card/50" open={false}>
          <summary className="cursor-pointer select-none px-5 py-3 flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">Inline JSON Preview</span>
            <span className="text-xs text-muted-foreground">{preview.length} chars</span>
          </summary>
          <pre className="px-5 pb-5 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-muted-foreground">
            {preview}
          </pre>
        </details>
      )}

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
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#0F1620] border border-[#1E2E40] rounded-xl p-5 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Sparkles size={14} className="text-[#2DD4A8]" />
              Import schema from JSON sample
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Paste a JSON object showing the shape you want. Field names become schema fields,
              nested objects become sub-schemas, arrays become array fields.
            </p>
          </div>
          <button onClick={onClose} type="button" className="p-1.5 rounded-md hover:bg-[#1A2535]">
            <X size={14} />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'{\n  "title": "",\n  "score": 0,\n  "tags": ["example"]\n}'}
          className="flex-1 min-h-64 px-3 py-2 rounded-lg border border-[#1E2E40] bg-[#0A1017] text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40"
          autoFocus
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            type="button"
            className="px-3 py-1.5 rounded-lg border border-[#1E2E40] text-sm hover:bg-[#1A2535] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleParse}
            type="button"
            disabled={!text.trim()}
            className="px-3 py-1.5 rounded-lg bg-[#2DD4A8] text-[#0A1017] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_16px_-4px_rgba(45,212,168,0.5)] transition-all"
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
    <div className="space-y-1.5">
      {fields.length === 0 && depth === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
          No fields yet. Add one manually or use <strong className="text-foreground">Import JSON</strong>.
        </div>
      )}
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
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-[#2DD4A8] hover:border-[#2DD4A8]/50 transition-colors"
        >
          <Plus size={12} /> Add field
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
  const typeBadge = TYPE_BADGE[field.type];

  return (
    <div
      className={`group rounded-lg border bg-background/40 ${depth > 0 ? 'ml-4 border-dashed' : 'border-border'}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}
        <input
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          placeholder="field_name"
          className={`flex-1 min-w-0 px-2 py-1 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#2DD4A8]/40 ${
            nameError ? 'border-destructive' : 'border-border'
          }`}
          title={nameError}
        />
        <span
          className={`hidden sm:inline-flex shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${typeBadge}`}
        >
          {field.type}
        </span>
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
          className="shrink-0 w-20 px-1.5 py-1 rounded-md border border-border bg-background text-xs"
          aria-label="Field type"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
            className="accent-[#2DD4A8]"
          />
          required
        </label>
        <div className="shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Move up"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Move down"
          >
            <ChevronDown size={12} />
          </button>
          <button
            onClick={onRemove}
            type="button"
            className="p-1 text-muted-foreground hover:text-destructive"
            title="Remove field"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2">
          <input
            value={field.description}
            onChange={(e) => onChange({ ...field, description: e.target.value })}
            placeholder="Description (what this field represents, expected format, examples)"
            className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-[#2DD4A8]/40"
          />

          {field.type === 'array' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Items type</span>
                <select
                  value={field.items?.type ?? 'string'}
                  onChange={(e) => {
                    const itemType = e.target.value as 'string' | 'number' | 'boolean' | 'object';
                    const items = itemType === 'object'
                      ? { type: itemType, fields: field.items?.fields ?? [] }
                      : { type: itemType };
                    onChange({ ...field, items });
                  }}
                  className="px-2 py-1 rounded-md border border-border bg-background text-xs"
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
