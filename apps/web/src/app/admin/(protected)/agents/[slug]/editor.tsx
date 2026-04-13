'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { updateAgentAction } from './actions';

interface Agent {
  id: string;
  name: string;
  slug: string;
  stage: string;
  instructions: string;
  input_schema: string | null;
  output_schema: string | null;
  updated_at: string;
}

export function AgentEditor({ agent }: { agent: Agent }) {
  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(agent.instructions);
  const [inputSchema, setInputSchema] = useState(agent.input_schema ?? '');
  const [outputSchema, setOutputSchema] = useState(agent.output_schema ?? '');
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
          <Link href="/admin/agents" className="text-xs text-muted-foreground hover:underline">
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
