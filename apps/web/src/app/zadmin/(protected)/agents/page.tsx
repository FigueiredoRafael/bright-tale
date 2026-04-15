import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminPath } from '@/lib/admin-path';
import { PipelineGraph } from './pipeline';

export const dynamic = 'force-dynamic';

interface AgentRow {
  id: string;
  name: string;
  slug: string;
  stage: string;
  updated_at: string;
}

async function fetchAgents(): Promise<AgentRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('agent_prompts')
    .select('id, name, slug, stage, updated_at')
    .order('stage', { ascending: true })
    .order('slug', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AgentRow[];
}

export default async function AgentsAdminPage() {
  const agents = await fetchAgents();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agentes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prompts usados pelo pipeline de conteúdo. Alterações refletem na próxima geração (cache 5min).
        </p>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3 text-muted-foreground">Pipeline</h2>
        <PipelineGraph agents={agents} />
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-left px-4 py-2 font-medium">Slug</th>
              <th className="text-left px-4 py-2 font-medium">Stage</th>
              <th className="text-left px-4 py-2 font-medium">Atualizado</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{a.slug}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-secondary">{a.stage}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(a.updated_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={adminPath(`/agents/${encodeURIComponent(a.slug)}`)}
                    className="text-primary text-xs hover:underline"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum agente cadastrado. Rode <code>npm run db:seed</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
