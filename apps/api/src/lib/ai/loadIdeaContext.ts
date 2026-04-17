// apps/api/src/lib/ai/loadIdeaContext.ts
import { createServiceClient } from '../supabase/index.js';

export interface IdeaContext {
  id: string;
  title: string;
  core_tension: string;
  target_audience: string;
  scroll_stopper?: string;
  curiosity_gap?: string;
  monetization?: {
    affiliate_angle?: string;
    product_fit?: string;
    sponsor_appeal?: string;
  };
  repurpose_potential?: {
    blog_angle?: string;
    video_angle?: string;
    shorts_hooks?: string[];
    podcast_angle?: string;
  };
  tags?: string[];
}

interface DiscoveryFields {
  scroll_stopper?: string;
  curiosity_gap?: string;
  monetization?: IdeaContext['monetization'];
  repurpose_potential?: IdeaContext['repurpose_potential'];
}

export function parseDiscoveryData(raw: unknown): DiscoveryFields {
  if (!raw) return {};
  let obj: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  } else if (typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else {
    return {};
  }

  return {
    scroll_stopper: typeof obj.scroll_stopper === 'string' ? obj.scroll_stopper : undefined,
    curiosity_gap: typeof obj.curiosity_gap === 'string' ? obj.curiosity_gap : undefined,
    monetization: obj.monetization && typeof obj.monetization === 'object'
      ? obj.monetization as IdeaContext['monetization']
      : undefined,
    repurpose_potential: obj.repurpose_potential && typeof obj.repurpose_potential === 'object'
      ? obj.repurpose_potential as IdeaContext['repurpose_potential']
      : undefined,
  };
}

export async function loadIdeaContext(ideaId: string): Promise<IdeaContext | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('idea_archives')
    .select('id, title, core_tension, target_audience, discovery_data, tags')
    .eq('id', ideaId)
    .maybeSingle();

  if (error || !data) return null;

  const discovery = parseDiscoveryData(data.discovery_data);

  return {
    id: data.id,
    title: data.title,
    core_tension: data.core_tension,
    target_audience: data.target_audience,
    tags: data.tags ?? undefined,
    ...discovery,
  };
}
