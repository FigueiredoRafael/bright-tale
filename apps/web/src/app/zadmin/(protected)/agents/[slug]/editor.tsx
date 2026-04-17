'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { adminPath } from '@/lib/admin-path';
import { updateAgentAction } from './actions';

interface Agent {
  id: string;
  name: string;
  slug: string;
  stage: string;
  instructions: string;
  input_schema: string | null;
  output_schema: string | null;
  recommended_provider: string | null;
  recommended_model: string | null;
  sections_json: Record<string, unknown> | null;
  updated_at: string;
}

const PROVIDER_OPTIONS = [
  { value: '', label: '— sem recomendação —' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
];

// Suggested models per provider — admin can override with a custom model name.
const MODEL_SUGGESTIONS: Record<string, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
  anthropic: ['claude-sonnet-4-5-20250514', 'claude-opus-4-5-20250514', 'claude-haiku-4-5-20251001'],
};

export function AgentEditor({ agent }: { agent: Agent }) {
  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(agent.instructions);
  const [inputSchema, setInputSchema] = useState(agent.input_schema ?? '');
  const [outputSchema, setOutputSchema] = useState(agent.output_schema ?? '');
  const [provider, setProvider] = useState(agent.recommended_provider ?? '');
  const [model, setModel] = useState(agent.recommended_model ?? '');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const res = await updateAgentAction({
        id: agent.id,
        name,
        instructions,
        input_schema: inputSchema || null,
        output_schema: outputSchema || null,
        recommended_provider: provider || null,
        recommended_model: model || null,
        sections_json: agent.sections_json,
      });
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Salvo. Nova versão refletirá na próxima geração (cache 5min).' });
      } else {
        setMessage({ kind: 'err', text: res.message });
      }
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href={adminPath('/agents')} className="text-xs text-muted-foreground hover:underline">
            ← Voltar
          </Link>
          <h1 className="text-2xl font-bold mt-1">{agent.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{agent.slug}</span>
            <span>·</span>
            <span>{agent.stage}</span>
            <span>·</span>
            <span>Atualizado {new Date(agent.updated_at).toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-md border bg-background text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Instructions <span className="text-xs text-muted-foreground">(prompt system)</span>
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={24}
            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono"
          />
        </div>

        <div className="space-y-3 p-4 rounded-md border bg-muted/20">
          <div>
            <h3 className="text-sm font-medium">Modelo recomendado</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              O app vai mostrar este modelo como &ldquo;Recommended&rdquo; para essa etapa do pipeline.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel('');
                }}
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
                onChange={(e) => setModel(e.target.value)}
                disabled={!provider}
                list={`models-${provider}`}
                placeholder={provider ? 'ex: gemini-2.5-flash' : 'escolha um provider primeiro'}
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Input schema <span className="text-xs text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              value={inputSchema}
              onChange={(e) => setInputSchema(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-md border bg-background text-xs font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Output schema <span className="text-xs text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              value={outputSchema}
              onChange={(e) => setOutputSchema(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-md border bg-background text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={pending}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {pending ? 'Salvando...' : 'Salvar'}
          </button>
          {message && (
            <span className={`text-xs ${message.kind === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
