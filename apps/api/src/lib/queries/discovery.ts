import { createServiceClient } from '@/lib/supabase';
import { SupabaseError } from '@/lib/api/errors';

type DiscoveryInput = {
  research: {
    title: string;
    theme: string;
    research_content: string;
    sources?: Array<{ url: string; title: string; author?: string }>;
  };
  ideas: string[];
  defaults?: { goal?: string };
};

export async function createProjectsFromDiscovery(input: DiscoveryInput) {
  if (input.ideas.length === 0) {
    throw new Error('At least one idea must be selected');
  }
  const sb = createServiceClient();

  const { data: research, error: researchErr } = await sb
    .from('research_archives')
    .insert({
      title: input.research.title,
      theme: input.research.theme,
      research_content: input.research.research_content,
    })
    .select()
    .single();

  if (researchErr || !research) throw new SupabaseError(researchErr ?? { message: 'Failed to create research' });

  if (input.research.sources?.length) {
    const { error: srcErr } = await sb
      .from('research_sources')
      .insert(input.research.sources.map(s => ({ ...s, research_id: research.id })));
    if (srcErr) throw new SupabaseError(srcErr);
  }

  const projectInserts = input.ideas.map(ideaId => ({
    title: `Project for ${ideaId}`,
    research_id: research.id,
    current_stage: 'brainstorm',
    completed_stages: [] as string[],
    auto_advance: true,
    status: 'active',
  }));

  const { data: projects, error: projErr } = await sb
    .from('projects')
    .insert(projectInserts)
    .select();

  if (projErr || !projects) throw new SupabaseError(projErr ?? { message: 'Failed to create projects' });

  return {
    research_id: research.id,
    project_ids: projects.map((p: any) => p.id),
  };
}
