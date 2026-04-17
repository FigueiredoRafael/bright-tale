'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { adminPath } from '@/lib/admin-path';
import { updateAgentAction } from './actions';
import {
  assembleInstructions,
  RULE_LIBRARY,
  type SectionsJson,
} from '@brighttale/shared';
import { SchemaBuilder } from '@/components/agents/SchemaBuilder';
import { validateAgent, errorsByScope, type AgentValidationError } from '@/components/agents/validateAgent';

interface Agent {
  id: string;
  name: string;
  slug: string;
  stage: string;
  instructions: string;
  input_schema: string | null;
  output_schema: string | null;
  sections_json: SectionsJson | null;
  recommended_provider: string | null;
  recommended_model: string | null;
  updated_at: string;
}

const TABS = ['Header', 'Input Schema', 'Output Schema', 'Rules', 'Custom Sections', 'Settings'] as const;
type Tab = typeof TABS[number];

const TAB_TO_SCOPE: Record<Tab, AgentValidationError['scope'] | null> = {
  'Header': 'header',
  'Input Schema': 'inputSchema',
  'Output Schema': 'outputSchema',
  'Rules': 'rules',
  'Custom Sections': 'customSections',
  'Settings': null,
};

const PROVIDER_OPTIONS = [
  { value: '', label: '-- no recommendation --' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
  anthropic: ['claude-sonnet-4-5-20250514', 'claude-opus-4-5-20250514', 'claude-haiku-4-5-20251001'],
};

function emptySections(): SectionsJson {
  return {
    header: { role: '', context: '', principles: [], purpose: [] },
    inputSchema: { name: '', fields: [] },
    outputSchema: { name: '', fields: [] },
    rules: { formatting: [], content: [], validation: [] },
    customSections: [],
  };
}

export function AgentEditor({ agent }: { agent: Agent }) {
  const initial = useMemo(
    () => ({
      name: agent.name,
      sections: agent.sections_json ?? emptySections(),
      provider: agent.recommended_provider ?? '',
      model: agent.recommended_model ?? '',
    }),
    [agent],
  );

  const [activeTab, setActiveTab] = useState<Tab>('Header');
  const [name, setName] = useState(initial.name);
  const [sections, setSections] = useState<SectionsJson>(initial.sections);
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const showImportBanner = !agent.sections_json;

  const isDirty = useMemo(() => {
    return (
      name !== initial.name ||
      provider !== initial.provider ||
      model !== initial.model ||
      JSON.stringify(sections) !== JSON.stringify(initial.sections)
    );
  }, [name, sections, provider, model, initial]);

  const errors = useMemo(() => validateAgent(sections, name), [sections, name]);
  const errorsByTab = useMemo(() => errorsByScope(errors), [errors]);
  const canSave = isDirty && errors.length === 0 && !pending;

  const preview = useMemo(() => {
    try {
      return assembleInstructions(sections);
    } catch {
      return '(Error assembling preview)';
    }
  }, [sections]);

  const handleSave = useCallback(() => {
    if (errors.length > 0) {
      setMessage({ kind: 'err', text: `Fix ${errors.length} validation issue${errors.length === 1 ? '' : 's'} before saving.` });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const assembled = assembleInstructions(sections);
      const res = await updateAgentAction({
        id: agent.id,
        name,
        instructions: assembled,
        input_schema: null,
        output_schema: null,
        recommended_provider: provider || null,
        recommended_model: model || null,
        sections_json: sections as unknown as Record<string, unknown>,
      });
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Saved. Changes reflect on next generation (5min cache).' });
      } else {
        setMessage({ kind: 'err', text: res.message });
      }
    });
  }, [agent.id, errors.length, model, name, provider, sections]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canSave) handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSave, handleSave]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href={adminPath('/agents')} className="text-xs text-muted-foreground hover:underline">
            &larr; Back to Agents
          </Link>
          <h1 className="text-2xl font-bold mt-1">{agent.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{agent.slug}</span>
            <span>&middot;</span>
            <span className="px-1.5 py-0.5 rounded bg-muted capitalize">{agent.stage}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-xs text-amber-500" title="You have unsaved changes">
              &bull; Unsaved
            </span>
          )}
          {errors.length > 0 && (
            <span className="text-xs text-destructive" title={errors.map((e) => e.message).join('\n')}>
              {errors.length} issue{errors.length === 1 ? '' : 's'}
            </span>
          )}
          {message && (
            <span className={`text-xs ${message.kind === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
              {message.text}
            </span>
          )}
          <button
            onClick={() => setPreviewOpen(!previewOpen)}
            type="button"
            className="px-3 py-2 rounded-md border text-sm hover:bg-muted/50"
            title={previewOpen ? 'Hide preview' : 'Show preview'}
          >
            {previewOpen ? 'Hide preview' : 'Show preview'}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            title="Save (Cmd+S)"
          >
            {pending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {showImportBanner && (
        <div className="mb-4 p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-sm">
          This agent uses raw instructions. The structured editor starts empty. Fill each section
          section, or use <strong>Import JSON</strong> in the schema tabs to infer fields from a sample.
        </div>
      )}

      <div className="flex gap-6">
        <nav className="w-44 shrink-0 space-y-1">
          {TABS.map((tab) => {
            const scope = TAB_TO_SCOPE[tab];
            const tabErrors = scope ? errorsByTab[scope]?.length ?? 0 : 0;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
                className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-md text-sm ${
                  activeTab === tab
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <span>{tab}</span>
                {tabErrors > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground">
                    {tabErrors}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0">
          {activeTab === 'Header' && (
            <HeaderTab
              sections={sections}
              onChange={setSections}
              name={name}
              onNameChange={setName}
              errors={errorsByTab.header ?? []}
            />
          )}
          {activeTab === 'Input Schema' && (
            <SchemaBuilder
              schema={sections.inputSchema}
              onChange={(inputSchema) => setSections({ ...sections, inputSchema })}
              errors={errorsByTab.inputSchema ?? []}
            />
          )}
          {activeTab === 'Output Schema' && (
            <SchemaBuilder
              schema={sections.outputSchema}
              onChange={(outputSchema) => setSections({ ...sections, outputSchema })}
              errors={errorsByTab.outputSchema ?? []}
            />
          )}
          {activeTab === 'Rules' && (
            <RulesTab sections={sections} onChange={setSections} />
          )}
          {activeTab === 'Custom Sections' && (
            <CustomSectionsTab
              sections={sections}
              onChange={setSections}
              errors={errorsByTab.customSections ?? []}
            />
          )}
          {activeTab === 'Settings' && (
            <SettingsTab
              slug={agent.slug}
              stage={agent.stage}
              provider={provider}
              model={model}
              onProviderChange={setProvider}
              onModelChange={setModel}
              updatedAt={agent.updated_at}
            />
          )}
        </div>

        {previewOpen && <PreviewPanel preview={preview} />}
      </div>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(preview);
    } catch {
      /* noop */
    }
  }
  return (
    <aside className="w-96 shrink-0">
      <div className="sticky top-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Live Preview</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{preview.length.toLocaleString()} chars</span>
            <button
              onClick={copy}
              type="button"
              className="text-xs px-2 py-0.5 rounded border hover:bg-muted/50"
              title="Copy to clipboard"
            >
              Copy
            </button>
          </div>
        </div>
        <pre className="p-3 rounded-md border bg-muted/30 text-xs font-mono whitespace-pre-wrap max-h-[80vh] overflow-y-auto">
          {preview}
        </pre>
      </div>
    </aside>
  );
}

function HeaderTab({
  sections,
  onChange,
  name,
  onNameChange,
  errors,
}: {
  sections: SectionsJson;
  onChange: (s: SectionsJson) => void;
  name: string;
  onNameChange: (n: string) => void;
  errors: AgentValidationError[];
}) {
  const nameError = errors.find((e) => e.path === 'name')?.message;
  const roleError = errors.find((e) => e.path === 'role')?.message;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Agent Name</label>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className={`w-full px-3 py-2 rounded-md border bg-background text-sm ${nameError ? 'border-destructive' : ''}`}
        />
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Role <span className="text-destructive">*</span></label>
          <span className="text-xs text-muted-foreground">{sections.header.role.length} chars</span>
        </div>
        <textarea
          value={sections.header.role}
          onChange={(e) => onChange({ ...sections, header: { ...sections.header, role: e.target.value } })}
          rows={3}
          placeholder="You are [role name]. Your job is to..."
          className={`w-full px-3 py-2 rounded-md border bg-background text-sm ${roleError ? 'border-destructive' : ''}`}
        />
        {roleError && <p className="text-xs text-destructive">{roleError}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Context <span className="text-muted-foreground">(optional)</span></label>
        <textarea
          value={sections.header.context}
          onChange={(e) => onChange({ ...sections, header: { ...sections.header, context: e.target.value } })}
          rows={3}
          placeholder="Background about the brand, audience, or pipeline this agent operates in."
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
      </div>
      <ListEditor
        label="Guiding Principles"
        items={sections.header.principles}
        onChange={(principles) => onChange({ ...sections, header: { ...sections.header, principles } })}
        placeholder="e.g. Default to skepticism over optimism"
      />
      <ListEditor
        label="Agent Purpose"
        items={sections.header.purpose}
        onChange={(purpose) => onChange({ ...sections, header: { ...sections.header, purpose } })}
        placeholder="e.g. Generate exactly the number of ideas requested"
      />
    </div>
  );
}

function RulesTab({ sections, onChange }: { sections: SectionsJson; onChange: (s: SectionsJson) => void }) {
  return (
    <div className="space-y-6">
      <ListEditor
        label="JSON Formatting Rules"
        items={sections.rules.formatting}
        onChange={(formatting) => onChange({ ...sections, rules: { ...sections.rules, formatting } })}
        library={RULE_LIBRARY.filter((e) => e.category === 'formatting')}
        placeholder="e.g. Output must be valid JSON"
      />
      <ListEditor
        label="Content Rules"
        items={sections.rules.content}
        onChange={(content) => onChange({ ...sections, rules: { ...sections.rules, content } })}
        library={RULE_LIBRARY.filter((e) => e.category === 'content')}
        placeholder="e.g. Do not invent statistics"
      />
      <ListEditor
        label="Validation Checks (Before finishing)"
        items={sections.rules.validation}
        onChange={(validation) => onChange({ ...sections, rules: { ...sections.rules, validation } })}
        library={RULE_LIBRARY.filter((e) => e.category === 'validation')}
        placeholder="e.g. Verify every required field is populated"
      />
    </div>
  );
}

function CustomSectionsTab({
  sections,
  onChange,
  errors,
}: {
  sections: SectionsJson;
  onChange: (s: SectionsJson) => void;
  errors: AgentValidationError[];
}) {
  function addSection() {
    onChange({
      ...sections,
      customSections: [...sections.customSections, { title: '', content: '' }],
    });
  }

  function updateSection(index: number, field: 'title' | 'content', value: string) {
    const updated = [...sections.customSections];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...sections, customSections: updated });
  }

  function removeSection(index: number) {
    onChange({
      ...sections,
      customSections: sections.customSections.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-4">
      {sections.customSections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Custom sections appear below the rules in the final prompt. Use them for field guidance,
          examples, handoff notes, or amendments.
        </p>
      )}
      {sections.customSections.map((section, i) => {
        const titleError = errors.find((e) => e.path === `customSections[${i}].title`)?.message;
        return (
          <div key={i} className="p-4 border rounded-md space-y-3">
            <div className="flex items-center gap-2">
              <input
                value={section.title}
                onChange={(e) => updateSection(i, 'title', e.target.value)}
                placeholder="Section title"
                className={`flex-1 px-2 py-1 rounded border bg-background text-sm font-medium ${
                  titleError ? 'border-destructive' : ''
                }`}
              />
              <button
                onClick={() => removeSection(i)}
                type="button"
                className="text-xs text-destructive px-2 py-1 rounded hover:bg-destructive/10"
                title="Remove section"
              >
                Remove
              </button>
            </div>
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
            <textarea
              value={section.content}
              onChange={(e) => updateSection(i, 'content', e.target.value)}
              rows={8}
              placeholder="Section content (markdown supported)"
              className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono"
            />
            <div className="text-xs text-muted-foreground text-right">{section.content.length} chars</div>
          </div>
        );
      })}
      <button
        onClick={addSection}
        type="button"
        className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
      >
        + Add Section
      </button>
    </div>
  );
}

function SettingsTab({
  slug,
  stage,
  provider,
  model,
  onProviderChange,
  onModelChange,
  updatedAt,
}: {
  slug: string;
  stage: string;
  provider: string;
  model: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
  updatedAt: string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Slug</label>
          <input value={slug} disabled className="w-full px-3 py-2 rounded-md border bg-muted text-sm opacity-60 font-mono" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Stage</label>
          <input value={stage} disabled className="w-full px-3 py-2 rounded-md border bg-muted text-sm opacity-60" />
        </div>
      </div>
      <div className="space-y-3 p-4 rounded-md border bg-muted/20">
        <h3 className="text-sm font-medium">Recommended Model</h3>
        <p className="text-xs text-muted-foreground">
          Suggestion only. Admins can override at runtime.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Provider</label>
            <select
              value={provider}
              onChange={(e) => { onProviderChange(e.target.value); onModelChange(''); }}
              className="w-full px-2 py-1.5 rounded-md border bg-background text-sm"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Model</label>
            <input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={!provider}
              list={`models-${provider}`}
              placeholder={provider ? 'e.g. gemini-2.5-flash' : 'choose provider first'}
              className="w-full px-2 py-1.5 rounded-md border bg-background text-sm disabled:opacity-50"
            />
            {provider && MODEL_SUGGESTIONS[provider] && (
              <datalist id={`models-${provider}`}>
                {MODEL_SUGGESTIONS[provider].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Last updated: {new Date(updatedAt).toLocaleString()}
      </div>
    </div>
  );
}

interface LibraryEntry {
  category: string;
  label: string;
  rules: readonly string[];
}

function ListEditor({
  label,
  items,
  onChange,
  placeholder,
  library,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  library?: readonly LibraryEntry[];
}) {
  const libraryRules = library?.flatMap((e) => e.rules) ?? [];
  const availableFromLibrary = libraryRules.filter((r) => !items.includes(r));

  function addAllFromLibrary(entry: LibraryEntry) {
    const missing = entry.rules.filter((r) => !items.includes(r));
    if (missing.length === 0) return;
    onChange([...items, ...missing]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        {library && library.length > 0 && (
          <div className="flex items-center gap-1">
            {library.map((entry) => {
              const added = entry.rules.every((r) => items.includes(r));
              return (
                <button
                  key={entry.label}
                  onClick={() => addAllFromLibrary(entry)}
                  type="button"
                  disabled={added}
                  className="text-xs px-2 py-0.5 rounded-full border hover:bg-muted/50 disabled:opacity-50"
                  title={added ? 'Already added' : `Add all ${entry.rules.length} rules from ${entry.label}`}
                >
                  + {entry.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {items.map((item, i) => {
        const fromLibrary = libraryRules.includes(item);
        return (
          <div key={i} className="flex items-center gap-2">
            {fromLibrary && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary" title="From standard library">
                lib
              </span>
            )}
            <input
              value={item}
              onChange={(e) => {
                const updated = [...items];
                updated[i] = e.target.value;
                onChange(updated);
              }}
              placeholder={placeholder}
              className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm"
            />
            <button
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              type="button"
              className="text-destructive px-2 py-1 rounded hover:bg-destructive/10 shrink-0"
              title="Remove"
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange([...items, ''])}
          type="button"
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
        >
          + Add
        </button>
        {availableFromLibrary.length > 0 && library && (
          <span className="text-xs text-muted-foreground">
            {availableFromLibrary.length} more available from library
          </span>
        )}
      </div>
    </div>
  );
}
