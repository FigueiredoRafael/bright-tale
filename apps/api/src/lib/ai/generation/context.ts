/**
 * Shared GenerationContext loader.
 *
 * Loads the full set of data needed to build a generation prompt:
 *   draft, persona (layered), channel (STAGE_CHANNEL_SELECT superset),
 *   research cards, and idea context.
 *
 * Every caller that previously loaded these separately can delegate here.
 * The function uses a SupabaseClient directly (no Inngest step wrapping) so
 * callers control their own step.run / async boundaries.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { STAGE_CHANNEL_SELECT } from './channel-select.js';
import { buildLayeredPersonaContext, loadPersonaForDraft } from '../../personas.js';
import { loadIdeaContext, type IdeaContext } from '../loadIdeaContext.js';
import type { Persona } from '@brighttale/shared/types/agents';

export interface GenerationContext {
  draft: Record<string, unknown>;
  persona: Persona | null;
  /** null when persona is null */
  layeredPersona: Awaited<ReturnType<typeof buildLayeredPersonaContext>> | null;
  /** null when draft has no channel_id */
  channel: Record<string, unknown> | null;
  idea: IdeaContext | null;
  /** approved_cards_json or cards_json from research_sessions; null if no session */
  researchCards: unknown;
}

/**
 * Load a GenerationContext for a given draft ID.
 * Does NOT wrap calls in Inngest step.run — callers should do that themselves
 * if they need replay-safe memoisation.
 */
export async function loadGenerationContext(
  sb: SupabaseClient,
  draftId: string,
): Promise<GenerationContext> {
  const { data: draftRow } = await sb
    .from('content_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();
  const draft = (draftRow ?? {}) as Record<string, unknown>;

  const [persona, channel, researchCards, idea] = await Promise.all([
    loadPersonaForDraft(draft, sb),
    draft.channel_id
      ? sb
          .from('channels')
          .select(STAGE_CHANNEL_SELECT)
          .eq('id', draft.channel_id as string)
          .maybeSingle()
          .then(({ data }) => (data as Record<string, unknown> | null))
      : Promise.resolve(null),
    draft.research_session_id
      ? sb
          .from('research_sessions')
          .select('approved_cards_json, cards_json')
          .eq('id', draft.research_session_id as string)
          .maybeSingle()
          .then(({ data }) =>
            data ? (data.approved_cards_json ?? data.cards_json ?? null) : null,
          )
      : Promise.resolve(null),
    draft.idea_id
      ? loadIdeaContext(draft.idea_id as string)
      : Promise.resolve(null),
  ]);

  const layeredPersona = persona ? await buildLayeredPersonaContext(persona, sb) : null;

  return { draft, persona, layeredPersona, channel, idea, researchCards };
}
