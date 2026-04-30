'use client';

import { useState } from 'react';
import { TOOL_META, type ToolMeta } from '@brighttale/shared';
import { AgentsNav } from '../agents-nav';
import { Code2, Info } from 'lucide-react';

const PROVIDERS = [
  { id: 'gemini', label: 'Gemini', color: 'text-blue-400' },
  { id: 'openai', label: 'OpenAI', color: 'text-green-400' },
  { id: 'anthropic', label: 'Anthropic', color: 'text-purple-400' },
  { id: 'ollama', label: 'Ollama', color: 'text-orange-400' },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];

function toolsForProvider(provider: ProviderId): ToolMeta[] {
  if (provider === 'ollama') return [];
  return TOOL_META.filter(
    t => !t.supportedProviders || t.supportedProviders.includes(provider as Exclude<ProviderId, 'ollama'>),
  );
}

function ProviderBadge({ name }: { name: string }) {
  const p = PROVIDERS.find(p => p.id === name);
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary ${p?.color ?? 'text-muted-foreground'}`}>
      {name}
    </span>
  );
}

function ToolRow({ tool }: { tool: ToolMeta }) {
  const providers = tool.supportedProviders ?? ['gemini', 'openai', 'anthropic'];
  return (
    <div className="flex items-start gap-4 px-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{tool.label}</span>
          <code className="text-[11px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
            {tool.name}
          </code>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
        {tool.requiresEnv && (
          <p className="text-[11px] font-mono mt-1">
            <span className="text-muted-foreground/60">requires </span>
            <span className="text-amber-400/80">{tool.requiresEnv}</span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        {providers.map(p => <ProviderBadge key={p} name={p} />)}
      </div>
    </div>
  );
}

function ProviderTab({
  provider,
  active,
  onClick,
}: {
  provider: typeof PROVIDERS[number];
  active: boolean;
  onClick: () => void;
}) {
  const tools = toolsForProvider(provider.id);
  return (
    <button
      onClick={onClick}
      type="button"
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? `border-[#2DD4A8] text-[#2DD4A8] font-medium`
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {provider.label}
      {provider.id !== 'ollama' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground leading-none">
          {tools.length}
        </span>
      )}
    </button>
  );
}

export default function AgentsToolsPage() {
  const [activeProvider, setActiveProvider] = useState<ProviderId>('gemini');

  const available = toolsForProvider(activeProvider);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Agentes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prompts usados pelo pipeline de conteúdo. Alterações refletem na próxima geração (cache 5min).
        </p>
      </div>

      <AgentsNav />

      <div>
        <div className="mb-1">
          <h2 className="text-base font-semibold">Tool Registry</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tools available per provider. Defined in{' '}
            <code className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
              packages/shared/src/constants/tools.ts
            </code>{' '}
            — add an entry to <code className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">TOOL_META</code> and
            register the executor in{' '}
            <code className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
              apps/api/src/lib/ai/tools/index.ts
            </code>
            .
          </p>
        </div>

        {/* Provider tabs */}
        <div className="flex gap-1 border-b border-border mt-4">
          {PROVIDERS.map(p => (
            <ProviderTab
              key={p.id}
              provider={p}
              active={activeProvider === p.id}
              onClick={() => setActiveProvider(p.id)}
            />
          ))}
        </div>

        {/* Tool list */}
        <div className="mt-4 bg-card border border-border rounded-xl overflow-hidden">
          {activeProvider === 'ollama' ? (
            <div className="flex items-start gap-3 px-4 py-6 text-sm text-muted-foreground">
              <Info size={16} className="mt-0.5 shrink-0" />
              <span>
                Tool calling is not supported for Ollama. Most local models do not reliably implement
                the function calling specification.
              </span>
            </div>
          ) : available.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <Code2 size={28} className="text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium">No tools registered</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add an entry to <code className="font-mono bg-secondary px-1 rounded">TOOL_META</code> in{' '}
                  <code className="font-mono bg-secondary px-1 rounded">packages/shared/src/constants/tools.ts</code>.
                </p>
              </div>
            </div>
          ) : (
            <div>
              {available.map(tool => (
                <ToolRow key={tool.name} tool={tool} />
              ))}
            </div>
          )}
        </div>

        {/* Summary across all providers */}
        {TOOL_META.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PROVIDERS.map(p => {
              const count = toolsForProvider(p.id).length;
              return (
                <div
                  key={p.id}
                  className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between"
                >
                  <span className={`text-sm font-medium ${p.color}`}>{p.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {p.id === 'ollama' ? '—' : `${count} tool${count !== 1 ? 's' : ''}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
