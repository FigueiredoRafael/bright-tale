'use client';

import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { adminPath } from '@/lib/admin-path';
import { updateAgentAction } from './actions';
import { assembleInstructions, type SectionsJson } from '@brighttale/shared';
import { SchemaBuilder } from '@/components/agents/SchemaBuilder';

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

const TABS = ['Header', 'Input Schema', 'Output Schema', 'Rules', 'Custom Sections', 'Preview', 'Settings'] as const;
type Tab = typeof TABS[number];

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
  const [activeTab, setActiveTab] = useState<Tab>('Header');
  const [name, setName] = useState(agent.name);
  const [sections, setSections] = useState<SectionsJson>(agent.sections_json ?? emptySections());
  const [provider, setProvider] = useState(agent.recommended_provider ?? '');
  const [model, setModel] = useState(agent.recommended_model ?? '');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showImportBanner] = useState(!agent.sections_json);

  const preview = useMemo(() => {
    try {
      return assembleInstructions(sections);
    } catch {
      return '(Error assembling preview)';
    }
  }, [sections]);

  function handleSave() {
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
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={adminPath('/agents')} className="text-xs text-muted-foreground hover:underline">
            &larr; Back to Agents
          </Link>
          <h1 className="text-2xl font-bold mt-1">{agent.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{agent.slug}</span>
            <span>&middot;</span>
            <span>{agent.stage}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-xs ${message.kind === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
              {message.text}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={pending}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {pending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {showImportBanner && (
        <div className="mb-4 p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-sm">
          This agent uses raw instructions. The structured editor starts empty. You can manually fill each section.
        </div>
      )}

      <div className="flex gap-6">
        <nav className="w-44 shrink-0 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                activeTab === tab
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {activeTab === 'Header' && (
            <HeaderTab sections={sections} onChange={setSections} name={name} onNameChange={setName} />
          )}
          {activeTab === 'Input Schema' && (
            <SchemaBuilder
              schema={sections.inputSchema}
              onChange={(inputSchema) => setSections({ ...sections, inputSchema })}
            />
          )}
          {activeTab === 'Output Schema' && (
            <SchemaBuilder
              schema={sections.outputSchema}
              onChange={(outputSchema) => setSections({ ...sections, outputSchema })}
            />
          )}
          {activeTab === 'Rules' && (
            <RulesTab sections={sections} onChange={setSections} />
          )}
          {activeTab === 'Custom Sections' && (
            <CustomSectionsTab sections={sections} onChange={setSections} />
          )}
          {activeTab === 'Preview' && (
            <PreviewTab preview={preview} />
          )}
          {activeTab === 'Settings' && (
            <SettingsTab
              slug={agent.slug}
              stage={agent.stage}
              provider={provider}
              model={model}
              onProviderChange={setProvider}
              onModelChange={setModel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderTab({
  sections,
  onChange,
  name,
  onNameChange,
}: {
  sections: SectionsJson;
  onChange: (s: SectionsJson) => void;
  name: string;
  onNameChange: (n: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Agent Name</label>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Role</label>
        <textarea
          value={sections.header.role}
          onChange={(e) => onChange({ ...sections, header: { ...sections.header, role: e.target.value } })}
          rows={3}
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Context</label>
        <textarea
          value={sections.header.context}
          onChange={(e) => onChange({ ...sections, header: { ...sections.header, context: e.target.value } })}
          rows={3}
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
      </div>
      <ListEditor
        label="Guiding Principles"
        items={sections.header.principles}
        onChange={(principles) => onChange({ ...sections, header: { ...sections.header, principles } })}
      />
      <ListEditor
        label="Agent Purpose"
        items={sections.header.purpose}
        onChange={(purpose) => onChange({ ...sections, header: { ...sections.header, purpose } })}
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
      />
      <ListEditor
        label="Content Rules"
        items={sections.rules.content}
        onChange={(content) => onChange({ ...sections, rules: { ...sections.rules, content } })}
      />
      <ListEditor
        label="Validation Checks (Before finishing)"
        items={sections.rules.validation}
        onChange={(validation) => onChange({ ...sections, rules: { ...sections.rules, validation } })}
      />
    </div>
  );
}

function CustomSectionsTab({ sections, onChange }: { sections: SectionsJson; onChange: (s: SectionsJson) => void }) {
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
      {sections.customSections.map((section, i) => (
        <div key={i} className="p-4 border rounded-md space-y-3">
          <div className="flex items-center justify-between">
            <input
              value={section.title}
              onChange={(e) => updateSection(i, 'title', e.target.value)}
              placeholder="Section title"
              className="px-2 py-1 rounded border bg-background text-sm font-medium flex-1 mr-2"
            />
            <button
              onClick={() => removeSection(i)}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
          <textarea
            value={section.content}
            onChange={(e) => updateSection(i, 'content', e.target.value)}
            rows={6}
            placeholder="Section content (markdown)"
            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono"
          />
        </div>
      ))}
      <button
        onClick={addSection}
        className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
      >
        + Add Section
      </button>
    </div>
  );
}

function PreviewTab({ preview }: { preview: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Assembled Instructions Preview</h3>
        <span className="text-xs text-muted-foreground">{preview.length} chars</span>
      </div>
      <pre className="p-4 rounded-md border bg-muted/30 text-xs font-mono whitespace-pre-wrap max-h-[70vh] overflow-y-auto">
        {preview}
      </pre>
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
}: {
  slug: string;
  stage: string;
  provider: string;
  model: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Slug</label>
          <input value={slug} disabled className="w-full px-3 py-2 rounded-md border bg-muted text-sm opacity-60" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Stage</label>
          <input value={stage} disabled className="w-full px-3 py-2 rounded-md border bg-muted text-sm opacity-60" />
        </div>
      </div>
      <div className="space-y-3 p-4 rounded-md border bg-muted/20">
        <h3 className="text-sm font-medium">Recommended Model</h3>
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
    </div>
  );
}

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item}
            onChange={(e) => {
              const updated = [...items];
              updated[i] = e.target.value;
              onChange(updated);
            }}
            className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm"
          />
          <button
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="text-xs text-destructive hover:underline shrink-0"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ''])}
        className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
      >
        + Add
      </button>
    </div>
  );
}
