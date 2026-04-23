import type { SupabaseClient } from '@supabase/supabase-js';
import type { Persona, PersonaContext, PersonaVoice } from '@brighttale/shared/types/agents';
import { mapPersonaFromDb, type DbPersona, type ArchetypeOverlay } from '@brighttale/shared/mappers/db';

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

/**
 * Fetch all active guardrail rule strings ordered by sort_order.
 */
export async function fetchActiveGuardrails(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb
    .from('persona_guardrails')
    .select('rule_text')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []).map((r: { rule_text: string }) => r.rule_text);
}

/**
 * Fetch the behavioral overlay for a given archetype slug.
 */
export async function fetchArchetypeOverlay(
  slug: string,
  sb: SupabaseClient,
): Promise<ArchetypeOverlay | null> {
  const { data } = await sb
    .from('persona_archetypes')
    .select('behavioral_overlay_json')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) return null;
  const raw = data.behavioral_overlay_json as { constraints?: string[]; behavioralAdditions?: string[] } | null;
  return {
    constraints: raw?.constraints ?? [],
    behavioralAdditions: raw?.behavioralAdditions ?? [],
  };
}

/**
 * Compile guardrail rules + archetype overlay into a flat constraint list.
 * Pure function — no DB access.
 */
export function compileConstraints(
  guardrailRules: string[],
  overlay: ArchetypeOverlay | null,
): string[] {
  return [
    ...guardrailRules,
    ...(overlay?.constraints ?? []),
    ...(overlay?.behavioralAdditions ?? []),
  ];
}
