/**
 * Single entry point for validating a freshly-produced draft.
 *
 * Orchestrates the universal draft validators + persona-specific validators
 * and returns combined findings split by severity. Used at every produce save
 * point (sync /produce route + manual-output paste route + Inngest job).
 */

import type { Persona } from '@brighttale/shared/types/agents';
import { runDraftValidators } from './draftValidators.js';
import { runPersonaValidators } from './personaValidators.js';
import { mergeFindings } from './types.js';
import type { ValidationFindings } from './types.js';

interface DraftJsonShape {
  full_draft?: string;
  outline?: Array<{ h2: string }>;
  affiliate_integration?: { copy?: string };
}

interface CanonicalCoreShape {
  argument_chain?: Array<{ source_ids?: string[] }>;
  key_stats?: Array<{ source_id?: string }>;
}

/**
 * Validate a produced draft against universal + persona-specific guardrails.
 * Persona may be null — skips the persona checks.
 */
export function validateProducedDraft(
  draftJson: DraftJsonShape | null | undefined,
  canonicalCore: CanonicalCoreShape | null | undefined,
  persona: Persona | null | undefined,
): ValidationFindings {
  const fullDraft = draftJson?.full_draft ?? '';
  const outline = (draftJson?.outline ?? []).filter((o): o is { h2: string } => typeof o?.h2 === 'string');
  const affiliateCopy = draftJson?.affiliate_integration?.copy;
  const signaturePhrases = persona?.writingVoiceJson.signaturePhrases ?? [];

  if (!fullDraft) {
    return {
      critical: ['Draft has no full_draft content to validate'],
      important: [],
      minor: [],
    };
  }

  const universal = runDraftValidators({
    fullDraft,
    outline,
    canonicalCore: canonicalCore ?? {},
    signaturePhrases,
  });

  const personaFindings = runPersonaValidators(persona?.slug, {
    fullDraft,
    affiliateCopy,
    outline,
  });

  return mergeFindings(universal, personaFindings);
}

export { runDraftValidators } from './draftValidators.js';
export { runPersonaValidators } from './personaValidators.js';
export type { ValidationFindings } from './types.js';
