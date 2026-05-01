'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Check, Copy, Eye, EyeOff, Plus, Save, Sparkles, Trash2, X,
  AlertTriangle, ChevronUp, ChevronDown,
} from 'lucide-react';
import { adminPath } from '@/lib/admin-path';
import { updateAgentAction } from './actions';
import {
  assembleInstructions,
  RULE_LIBRARY,
  TOOL_META,
  toolsForProvider,
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
  tools_json: string[] | null;
  updated_at: string;
}

interface ProviderRow {
  provider: string;
  isActive: boolean;
  models: string[];
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

const STAGE_COLORS: Record<string, string> = {
  brainstorm: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  research: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  production: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  review: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  assets: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini:    'Gemini (Google)',
  openai:    'OpenAI',
  anthropic: 'Anthropic (Claude)',
  ollama:    'Ollama (local)',
  manual:    'Manual',
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

export function AgentEditor({ agent, providers = [] }: { agent: Agent; providers?: ProviderRow[] }) {
  const initial = useMemo(
    () => ({
      name: agent.name,
      sections: agent.sections_json ?? emptySections(),
      provider: agent.recommended_provider ?? '',
      model: agent.recommended_model ?? '',
      tools: Array.isArray(agent.tools_json) ? agent.tools_json : [],
    }),
    [agent],
  );

  const [activeTab, setActiveTab] = useState<Tab>('Header');
  const [name, setName] = useState(initial.name);
  const [sections, setSections] = useState<SectionsJson>(initial.sections);
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [tools, setTools] = useState<string[]>(initial.tools);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const showImportBanner = !agent.sections_json;

  const isDirty = useMemo(() => {
    return (
      name !== initial.name ||
      provider !== initial.provider ||
      model !== initial.model ||
      JSON.stringify(sections) !== JSON.stringify(initial.sections) ||
      JSON.stringify(tools) !== JSON.stringify(initial.tools)
    );
  }, [name, sections, provider, model, tools, initial]);

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
        tools_json: tools,
      });
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Saved. Changes reflect on next generation (5min cache).' });
      } else {
        setMessage({ kind: 'err', text: res.message });
      }
    });
  }, [agent.id, errors.length, model, name, provider, sections, tools]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canSave) handleSave();
      }
      if (e.key === 'Escape' && previewOpen) {
        setPreviewOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSave, handleSave, previewOpen]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const stageColor = STAGE_COLORS[agent.stage] ?? 'bg-muted text-muted-foreground border-border';

  return (
    <div className="min-h-full">
      {/* Top header — sticky */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border -mx-8 px-8 py-4 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={adminPath('/agents')}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={12} /> Back to Agents
            </Link>
            <h1 className="text-2xl font-bold mt-1 truncate">{agent.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <code className="text-xs font-mono text-muted-foreground">{agent.slug}</code>
              <span className="text-muted-foreground">·</span>
              <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${stageColor}`}>
                {agent.stage}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isDirty && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#2DD4A8]" title="Unsaved changes">
                <span className="w-2 h-2 rounded-full bg-[#2DD4A8] animate-pulse" />
                Unsaved
              </span>
            )}
            {errors.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive" title={errors.map((e) => e.message).join('\n')}>
                <AlertTriangle size={12} />
                {errors.length} issue{errors.length === 1 ? '' : 's'}
              </span>
            )}
            {message && (
              <span className={`inline-flex items-center gap-1 text-xs ${message.kind === 'ok' ? 'text-[#2DD4A8]' : 'text-destructive'}`}>
                {message.kind === 'ok' && <Check size={12} />}
                {message.text}
              </span>
            )}
            <button
              onClick={() => setPreviewOpen(!previewOpen)}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              title="Toggle live preview"
            >
              {previewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
              <span className="hidden sm:inline">{previewOpen ? 'Hide preview' : 'Preview'}</span>
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                canSave
                  ? 'bg-[#2DD4A8] text-[#0A1017] shadow-[0_0_0_0_rgba(45,212,168,0.4)] hover:shadow-[0_0_24px_-4px_rgba(45,212,168,0.5)]'
                  : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
              }`}
              title="Save (⌘S)"
            >
              <Save size={14} />
              {pending ? 'Saving…' : 'Save'}
              <kbd className="hidden md:inline ml-1 text-[10px] opacity-60 font-mono">⌘S</kbd>
            </button>
          </div>
        </div>
      </div>

      {showImportBanner && (
        <div className="mb-4 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-sm flex items-start gap-2">
          <Sparkles size={14} className="mt-0.5 text-yellow-500 shrink-0" />
          <span>
            This agent uses raw instructions. The structured editor starts empty.
            Fill each section, or use <strong>Import JSON</strong> on schema tabs to infer fields from a sample.
          </span>
        </div>
      )}

      {/* Main layout: responsive */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Tab nav */}
        <nav
          className="flex lg:flex-col gap-1 lg:w-48 shrink-0 overflow-x-auto lg:overflow-x-visible -mx-8 px-8 lg:mx-0 lg:px-0 pb-2 lg:pb-0 border-b border-border lg:border-b-0"
          aria-label="Editor sections"
        >
          {TABS.map((tab) => {
            const scope = TAB_TO_SCOPE[tab];
            const tabErrors = scope ? errorsByTab[scope]?.length ?? 0 : 0;
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
                className={`shrink-0 flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap ${
                  active
                    ? 'bg-[rgba(45,212,168,0.10)] text-[#2DD4A8] font-medium lg:shadow-[inset_3px_0_0_#2DD4A8]'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <span>{tab}</span>
                {tabErrors > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground leading-none">
                    {tabErrors}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Content area */}
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
              tools={tools}
              providers={providers}
              onProviderChange={setProvider}
              onModelChange={setModel}
              onToolsChange={setTools}
              updatedAt={agent.updated_at}
            />
          )}
        </div>
      </div>

      {/* Live preview — overlay drawer */}
      <PreviewDrawer preview={preview} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}

function PreviewDrawer({
  preview,
  open,
  onClose,
}: {
  preview: string;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-[600px] bg-[#0F1620] border-l border-[#1E2E40] shadow-2xl transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2E40]">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-[#2DD4A8]" />
            <h3 className="text-sm font-medium">Live Preview</h3>
            <span className="text-xs text-muted-foreground">· {preview.length.toLocaleString()} chars</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={copy}
              type="button"
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-[#1E2E40] hover:bg-[#1A2535] transition-colors"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-md hover:bg-[#1A2535] transition-colors"
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <pre className="px-5 py-4 text-xs font-mono whitespace-pre-wrap overflow-y-auto h-[calc(100vh-3.5rem)] text-[#CBD5E1]">
          <HighlightedPreview source={preview} />
        </pre>
      </aside>
    </>
  );
}

function HighlightedPreview({ source }: { source: string }) {
  // Minimal highlighting: tags, markdown headers, code fences
  const parts = source.split(/(<[^>]+>|^#{1,3} .+$|^---$|^```.*$)/gm);
  return (
    <>
      {parts.map((part, i) => {
        if (/^<[^>]+>$/.test(part)) return <span key={i} className="text-[#2DD4A8]">{part}</span>;
        if (/^#{1,3} /.test(part)) return <span key={i} className="text-amber-300 font-semibold">{part}</span>;
        if (part === '---') return <span key={i} className="text-[#475569]">{part}</span>;
        if (/^```/.test(part)) return <span key={i} className="text-[#64748B]">{part}</span>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Card({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {(title || hint) && (
        <div>
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      )}
      {children}
    </div>
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
    <div className="space-y-5">
      <Card title="Identity" hint="The agent name shown in admin UI. Role is the system prompt's opening — the most load-bearing field.">
        <Field label="Agent Name" error={nameError}>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className={inputClass(!!nameError)}
          />
        </Field>
        <Field
          label="Role"
          required
          meta={`${sections.header.role.length} chars`}
          error={roleError}
        >
          <textarea
            value={sections.header.role}
            onChange={(e) => onChange({ ...sections, header: { ...sections.header, role: e.target.value } })}
            rows={3}
            placeholder="You are [role name]. Your job is to…"
            className={textareaClass(!!roleError)}
          />
        </Field>
        <Field label="Context" hint="Optional. Background about the brand, audience, or pipeline.">
          <textarea
            value={sections.header.context}
            onChange={(e) => onChange({ ...sections, header: { ...sections.header, context: e.target.value } })}
            rows={3}
            placeholder="e.g. BrightTale produces long-form, evergreen-first content for a 25–40 audience…"
            className={textareaClass(false)}
          />
        </Field>
      </Card>

      <Card title="Principles & Purpose" hint="Bullet points the agent reads before task specifics.">
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
      </Card>
    </div>
  );
}

function RulesTab({ sections, onChange }: { sections: SectionsJson; onChange: (s: SectionsJson) => void }) {
  return (
    <div className="space-y-5">
      <Card title="JSON Formatting Rules" hint="Applied at the output layer. Pull from library for consistency.">
        <ListEditor
          label=""
          items={sections.rules.formatting}
          onChange={(formatting) => onChange({ ...sections, rules: { ...sections.rules, formatting } })}
          library={RULE_LIBRARY.filter((e) => e.category === 'formatting')}
          placeholder="e.g. Output must be valid JSON"
        />
      </Card>
      <Card title="Content Rules" hint="Behavioral expectations for what the agent produces.">
        <ListEditor
          label=""
          items={sections.rules.content}
          onChange={(content) => onChange({ ...sections, rules: { ...sections.rules, content } })}
          library={RULE_LIBRARY.filter((e) => e.category === 'content')}
          placeholder="e.g. Do not invent statistics"
        />
      </Card>
      <Card title="Validation Checks" hint="Self-review checklist run before emitting final JSON.">
        <ListEditor
          label=""
          items={sections.rules.validation}
          onChange={(validation) => onChange({ ...sections, rules: { ...sections.rules, validation } })}
          library={RULE_LIBRARY.filter((e) => e.category === 'validation')}
          placeholder="e.g. Verify every required field is populated"
        />
      </Card>
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

  function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= sections.customSections.length) return;
    const updated = [...sections.customSections];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    onChange({ ...sections, customSections: updated });
  }

  if (sections.customSections.length === 0) {
    return (
      <Card title="Custom Sections" hint="Appear below rules in the final prompt. Use for field guidance, examples, handoff notes, or amendments.">
        <button
          onClick={addSection}
          type="button"
          className="w-full flex items-center justify-center gap-2 px-3 py-6 rounded-lg border border-dashed border-border hover:border-[#2DD4A8] hover:bg-[rgba(45,212,168,0.05)] text-sm text-muted-foreground transition-colors"
        >
          <Plus size={14} /> Add first section
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sections.customSections.map((section, i) => {
        const titleError = errors.find((e) => e.path === `customSections[${i}].title`)?.message;
        return (
          <Card key={i}>
            <div className="flex items-start gap-2">
              <input
                value={section.title}
                onChange={(e) => updateSection(i, 'title', e.target.value)}
                placeholder="Section title"
                className={`flex-1 px-3 py-2 rounded-lg border bg-background text-sm font-semibold ${titleError ? 'border-destructive' : 'border-border'}`}
              />
              <div className="flex items-center gap-0.5">
                <IconButton onClick={() => moveSection(i, -1)} disabled={i === 0} title="Move up">
                  <ChevronUp size={14} />
                </IconButton>
                <IconButton onClick={() => moveSection(i, 1)} disabled={i === sections.customSections.length - 1} title="Move down">
                  <ChevronDown size={14} />
                </IconButton>
                <IconButton onClick={() => removeSection(i)} title="Remove" destructive>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
            <textarea
              value={section.content}
              onChange={(e) => updateSection(i, 'content', e.target.value)}
              rows={8}
              placeholder="Section content (markdown supported)"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Supports markdown</span>
              <span>{section.content.length} chars</span>
            </div>
          </Card>
        );
      })}
      <button
        onClick={addSection}
        type="button"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-card transition-colors"
      >
        <Plus size={14} /> Add section
      </button>
    </div>
  );
}

function SettingsTab({
  slug,
  stage,
  provider,
  model,
  tools,
  providers,
  onProviderChange,
  onModelChange,
  onToolsChange,
  updatedAt,
}: {
  slug: string;
  stage: string;
  provider: string;
  model: string;
  tools: string[];
  providers: ProviderRow[];
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onToolsChange: (t: string[]) => void;
  updatedAt: string;
}) {
  // Active providers only, excluding manual (no real model to recommend)
  const activeProviders = providers.filter(p => p.isActive && p.provider !== 'manual');

  // If the saved provider is now inactive, keep it visible so it doesn't
  // silently disappear — show it marked as unavailable.
  const savedProviderInactive =
    provider && !activeProviders.find(p => p.provider === provider);

  const modelSuggestions = activeProviders.find(p => p.provider === provider)?.models ?? [];

  return (
    <div className="space-y-5">
      <Card title="Identity" hint="Slug and stage are locked — they define how this agent wires into the pipeline.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Slug">
            <input value={slug} disabled className={inputClass(false) + ' opacity-60 font-mono'} />
          </Field>
          <Field label="Stage">
            <input value={stage} disabled className={inputClass(false) + ' opacity-60'} />
          </Field>
        </div>
      </Card>

      <Card title="Recommended Model" hint="Suggestion only. Engines use this as a starting point — users can override at generation time.">
        {activeProviders.length === 0 && (
          <p className="text-xs text-amber-400">
            No active providers. Go to{' '}
            <a href="/zadmin/providers" className="underline hover:text-amber-300">Providers</a>
            {' '}and enable at least one.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Provider">
            <select
              value={provider}
              onChange={(e) => { onProviderChange(e.target.value); onModelChange(''); }}
              className={inputClass(false)}
            >
              <option value="">-- no recommendation --</option>
              {activeProviders.map(p => (
                <option key={p.provider} value={p.provider}>
                  {PROVIDER_LABELS[p.provider] ?? p.provider}
                </option>
              ))}
              {savedProviderInactive && (
                <option value={provider} disabled>
                  {PROVIDER_LABELS[provider] ?? provider} (disabled — enable on Providers page)
                </option>
              )}
            </select>
          </Field>
          <Field label="Model">
            <input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={!provider}
              list={`models-${provider}`}
              placeholder={provider ? 'type or pick from list' : 'choose provider first'}
              className={inputClass(false) + (!provider ? ' opacity-50' : '')}
            />
            {provider && modelSuggestions.length > 0 && (
              <datalist id={`models-${provider}`}>
                {modelSuggestions.map(m => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
          </Field>
        </div>
      </Card>

      <ToolsCard provider={provider} tools={tools} onToolsChange={onToolsChange} />
      <div className="text-xs text-muted-foreground text-right">
        Last updated: {new Date(updatedAt).toLocaleString()}
      </div>
    </div>
  );
}

function ToolsCard({
  provider,
  tools,
  onToolsChange,
}: {
  provider: string;
  tools: string[];
  onToolsChange: (t: string[]) => void;
}) {
  const available = toolsForProvider(provider);

  function toggle(name: string, checked: boolean) {
    onToolsChange(checked ? [...tools, name] : tools.filter(t => t !== name));
  }

  return (
    <Card
      title="Tools"
      hint="Tools this agent can call during generation. Available tools depend on the selected provider — Ollama does not support tool calling."
    >
      {provider === 'ollama' ? (
        <p className="text-xs text-muted-foreground">Tool calling is not supported for Ollama.</p>
      ) : !provider ? (
        <p className="text-xs text-muted-foreground">Select a provider above to see available tools.</p>
      ) : available.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tools registered yet. Add entries to <code className="font-mono">TOOL_META</code> in <code className="font-mono">@brighttale/shared</code>.</p>
      ) : (
        <div className="space-y-3">
          {available.map(tool => {
            const enabled = tools.includes(tool.name);
            return (
              <label key={tool.name} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={e => toggle(tool.name, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-[#2DD4A8] cursor-pointer shrink-0"
                />
                <div>
                  <p className="text-sm font-medium leading-none group-hover:text-foreground transition-colors">
                    {tool.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>
                  {tool.requiresEnv && (
                    <p className="text-[11px] font-mono text-muted-foreground/60 mt-0.5">
                      requires <span className="text-amber-400/80">{tool.requiresEnv}</span>
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─── building blocks ───────────────────────────────────────────── */

function Field({
  label,
  required,
  hint,
  meta,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  meta?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
          {hint && <span className="normal-case text-muted-foreground/70 font-normal ml-1">({hint})</span>}
        </label>
        {meta && <span className="text-[11px] text-muted-foreground/70">{meta}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function IconButton({
  onClick,
  disabled,
  destructive,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        destructive ? 'hover:bg-destructive/10 text-destructive' : 'hover:bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function inputClass(hasError: boolean) {
  return `w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40 disabled:cursor-not-allowed ${
    hasError ? 'border-destructive' : 'border-border'
  }`;
}

function textareaClass(hasError: boolean) {
  return `w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40 resize-y ${
    hasError ? 'border-destructive' : 'border-border'
  }`;
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

  function moveItem(i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[i], next[target]] = [next[target], next[i]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {(label || (library && library.length > 0)) && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {label && <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>}
          {library && library.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {library.map((entry) => {
                const added = entry.rules.every((r) => items.includes(r));
                return (
                  <button
                    key={entry.label}
                    onClick={() => addAllFromLibrary(entry)}
                    type="button"
                    disabled={added}
                    className={`text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all ${
                      added
                        ? 'opacity-40 cursor-not-allowed border-border'
                        : 'border-[#2DD4A8]/30 text-[#2DD4A8] hover:bg-[rgba(45,212,168,0.08)]'
                    }`}
                    title={added ? 'All rules added' : `Add ${entry.rules.length} rules from ${entry.label}`}
                  >
                    <Plus size={10} /> {entry.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {items.map((item, i) => {
        const fromLibrary = libraryRules.includes(item);
        return (
          <div key={i} className="group flex items-center gap-1.5">
            {fromLibrary && (
              <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded bg-[rgba(45,212,168,0.12)] text-[#2DD4A8] font-mono uppercase" title="From standard library">
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
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40"
            />
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <IconButton onClick={() => moveItem(i, -1)} disabled={i === 0} title="Move up">
                <ChevronUp size={12} />
              </IconButton>
              <IconButton onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} title="Move down">
                <ChevronDown size={12} />
              </IconButton>
              <IconButton onClick={() => onChange(items.filter((_, idx) => idx !== i))} title="Remove" destructive>
                <X size={12} />
              </IconButton>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onChange([...items, ''])}
          type="button"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs hover:bg-card transition-colors"
        >
          <Plus size={12} /> Add
        </button>
        {availableFromLibrary.length > 0 && library && (
          <span className="text-[11px] text-muted-foreground">
            {availableFromLibrary.length} more available from library
          </span>
        )}
      </div>
    </div>
  );
}
