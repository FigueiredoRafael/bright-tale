import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function AgentEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();

  const [{ data: agent, error }, { data: providerRows }] = await Promise.all([
    db
      .from('agent_prompts')
      .select('id, name, slug, stage, instructions, input_schema, output_schema, recommended_provider, recommended_model, sections_json, tools_json, updated_at')
      .eq('slug', decodeURIComponent(slug))
      .maybeSingle(),
    db
      .from('ai_provider_configs')
      .select('provider, is_active, models_json')
      .order('provider'),
  ]);

  if (error) throw error;
  if (!agent) notFound();

  const providers = (providerRows ?? []).map((r: any) => ({
    provider:  r.provider as string,
    isActive:  r.is_active as boolean,
    models:    (r.models_json ?? []) as string[],
  }));

  return <AgentEditor agent={agent} providers={providers} />;
}
