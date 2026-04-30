import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function AgentEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();
  const { data: agent, error } = await db
    .from('agent_prompts')
    .select('id, name, slug, stage, instructions, input_schema, output_schema, recommended_provider, recommended_model, sections_json, tools_json, updated_at')
    .eq('slug', decodeURIComponent(slug))
    .maybeSingle();

  if (error) throw error;
  if (!agent) notFound();

  return <AgentEditor agent={agent} />;
}
