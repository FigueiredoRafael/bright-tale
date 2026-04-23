import type { SupabaseClient } from '@supabase/supabase-js';
import type { Persona, PersonaContext, PersonaVoice } from '@brighttale/shared/types/agents';
import { mapPersonaFromDb, type DbPersona } from '@brighttale/shared/mappers/db';

/**
 * Load the persona linked to a draft (via draft.persona_id) or return null.
 * Same signature whether the call site is a synchronous route handler or an
 * Inngest job — both pass an existing Supabase service client.
 */
export async function loadPersonaForDraft(
  draft: Record<string, unknown>,
  sb: SupabaseClient,
): Promise<Persona | null> {
  const personaId = (draft.persona_id as string | null | undefined) ?? null;
  if (!personaId) return null;
  const { data } = await sb
    .from('personas')
    .select('*')
    .eq('id', personaId)
    .maybeSingle();
  return data ? mapPersonaFromDb(data as DbPersona) : null;
}

export function buildPersonaContext(persona: Persona): PersonaContext {
  return {
    name: persona.name,
    domainLens: persona.domainLens,
    analyticalLens: persona.eeatSignalsJson.analyticalLens,
    strongOpinions: persona.soulJson.strongOpinions,
    approvedCategories: persona.approvedCategories,
  };
}

export function buildPersonaVoice(persona: Persona): PersonaVoice {
  return {
    name: persona.name,
    bioShort: persona.bioShort,
    writingVoice: {
      writingStyle: persona.writingVoiceJson.writingStyle,
      signaturePhrases: persona.writingVoiceJson.signaturePhrases,
      characteristicOpinions: persona.writingVoiceJson.characteristicOpinions,
    },
    soul: {
      humorStyle: persona.soulJson.humorStyle,
      recurringJokes: persona.soulJson.recurringJokes,
      languageGuardrails: persona.soulJson.languageGuardrails,
    },
  };
}
