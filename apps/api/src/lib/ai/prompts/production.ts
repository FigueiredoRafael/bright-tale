import type { IdeaContext } from "../loadIdeaContext.js";

export interface CanonicalCoreInput {
  type: string;
  title: string;
  ideaId?: string;
  idea?: IdeaContext | null;
  researchCards?: unknown;
  productionParams?: unknown;
  personaContext?: {
    name: string;
    domainLens: string;
    analyticalLens: string;
    strongOpinions: string[];
    approvedCategories: string[];
  } | null;
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export interface ProduceInput {
  type: string;
  title: string;
  canonicalCore: unknown;
  idea?: IdeaContext | null;
  productionParams?: unknown;
  sources?: unknown[];
  persona?: {
    name: string;
    bioShort: string;
    writingVoice: {
      writingStyle: string;
      signaturePhrases: string[];
      characteristicOpinions: string[];
    };
    soul: {
      humorStyle: string;
      recurringJokes: string[];
      languageGuardrails: string[];
    };
  } | null;
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export interface ReproduceInput {
  type: string;
  title: string;
  canonicalCore?: unknown;
  previousDraft?: unknown;
  idea?: IdeaContext | null;
  reviewFeedback: {
    overall_verdict?: string;
    score?: number | null;
    critical_issues?: string[];
    minor_issues?: string[];
    strengths?: string[];
  };
  /**
   * Revision iteration number (1 = first revision, 2 = second, ...). Lets the
   * prompt escalate language as the loop persists — by attempt 3+ we tell the
   * model the producer keeps failing to address the critical issues and must
   * rewrite more aggressively.
   */
  iterationCount?: number;
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

function channelBlock(ch?: {
  name?: string;
  niche?: string;
  language?: string;
  tone?: string;
}): string {
  if (!ch) return "";
  const parts: string[] = [];
  if (ch.name) parts.push(`Channel: ${ch.name}`);
  if (ch.language) parts.push(`Language: ${ch.language}`);
  if (ch.niche) parts.push(`Niche: ${ch.niche}`);
  if (ch.tone) parts.push(`Tone: ${ch.tone}`);
  return parts.length > 0 ? "\n" + parts.join("\n") : "";
}

function jsonBlock(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

// TODO: Too much hardcoded instructions, we gotta use the admin configs for the agents from db.
export function buildCanonicalCoreMessage(input: CanonicalCoreInput): string {
  const lines: string[] = [];
  lines.push(`Generate a canonical core for a ${input.type} content piece.`);
  lines.push(`Title: "${input.title}"`);
  if (input.ideaId) lines.push(`Idea ID: ${input.ideaId}`);

  if (input.idea) {
    lines.push("");
    lines.push("Selected idea:");
    lines.push(jsonBlock(input.idea));
  }

  if (input.researchCards) {
    lines.push("");
    lines.push("Approved research cards:");
    lines.push(jsonBlock(input.researchCards));
  }

  if (input.productionParams) {
    lines.push("");
    lines.push("Production parameters:");
    lines.push(jsonBlock(input.productionParams));
  }

  lines.push(channelBlock(input.channel));

  if (input.personaContext) {
    lines.push("");
    lines.push("<persona_context>");
    lines.push(`Name: ${input.personaContext.name}`);
    lines.push(`Domain lens: ${input.personaContext.domainLens}`);
    lines.push(`Analytical lens: ${input.personaContext.analyticalLens}`);
    lines.push("Strong opinions:");
    input.personaContext.strongOpinions.forEach((o) => lines.push(`- ${o}`));
    lines.push(
      `Approved categories: ${input.personaContext.approvedCategories.join(", ")}`,
    );
    lines.push("</persona_context>");
  }

  lines.push("");
  lines.push(
    "Respond with a JSON object matching the output contract. No markdown, no commentary.",
  );
  return lines.join("\n");
}

export function buildProduceMessage(input: ProduceInput): string {
  const lines: string[] = [];
  lines.push(`Produce a ${input.type} draft from the canonical core below.`);
  lines.push(`Title: "${input.title}"`);

  if (input.idea) {
    lines.push("");
    lines.push("Original idea context:");
    lines.push(jsonBlock(input.idea));
  }

  lines.push("");
  lines.push("Canonical core:");
  lines.push(jsonBlock(input.canonicalCore));

  if (input.productionParams) {
    lines.push("");
    lines.push("Production parameters:");
    lines.push(jsonBlock(input.productionParams));
  }

  if (
    input.sources &&
    Array.isArray(input.sources) &&
    input.sources.length > 0
  ) {
    lines.push("");
    lines.push(
      "Research sources (include referenced ones in ## Sources section of full_draft):",
    );
    lines.push(jsonBlock(input.sources));
  }

  lines.push(channelBlock(input.channel));

  if (input.persona) {
    lines.push("");
    lines.push("<persona>");
    lines.push(`Name: ${input.persona.name}`);
    lines.push(`Bio: ${input.persona.bioShort}`);
    lines.push(`Writing style: ${input.persona.writingVoice.writingStyle}`);
    lines.push(
      `Signature phrases: ${input.persona.writingVoice.signaturePhrases.join(" | ")}`,
    );
    lines.push(
      `Characteristic opinions: ${input.persona.writingVoice.characteristicOpinions.join(" | ")}`,
    );
    lines.push(`Humor style: ${input.persona.soul.humorStyle}`);
    lines.push("Language guardrails:");
    input.persona.soul.languageGuardrails.forEach((g) => lines.push(`- ${g}`));
    lines.push("</persona>");
  }

  lines.push("");
  lines.push(
    "Respond with a JSON object matching the output contract. No markdown, no commentary.",
  );
  return lines.join("\n");
}

export function buildReproduceMessage(input: ReproduceInput): string {
  const lines: string[] = [];
  const iter = typeof input.iterationCount === 'number' ? input.iterationCount : 1;
  const stubborn = iter >= 2;

  lines.push(`Revise the ${input.type} draft based on review feedback.`);
  lines.push(`Title: "${input.title}"`);
  lines.push("");
  lines.push(`Revision attempt: #${iter}`);
  if (stubborn) {
    lines.push(
      "Earlier revision attempts on this draft FAILED to address the critical issues — the reviewer flagged the same problems again. You must do better this round: a polish or cosmetic edit will fail review again.",
    );
  }
  lines.push("");
  lines.push(
    `Review verdict: ${input.reviewFeedback.overall_verdict ?? "unknown"}`,
  );
  if (input.reviewFeedback.score != null)
    lines.push(`Previous score: ${input.reviewFeedback.score}/100`);
  if (input.reviewFeedback.critical_issues?.length) {
    lines.push("");
    lines.push("Critical issues (MUST be resolved, not softened):");
    input.reviewFeedback.critical_issues.forEach((i) => lines.push(`- ${i}`));
  }
  if (input.reviewFeedback.minor_issues?.length) {
    lines.push("");
    lines.push("Minor issues to address:");
    input.reviewFeedback.minor_issues.forEach((i) => lines.push(`- ${i}`));
  }
  if (input.reviewFeedback.strengths?.length) {
    lines.push("");
    lines.push("Strengths to preserve:");
    input.reviewFeedback.strengths.forEach((s) => lines.push(`- ${s}`));
  }

  if (input.idea) {
    lines.push("");
    lines.push("Original idea context:");
    lines.push(jsonBlock(input.idea));
  }

  if (input.canonicalCore) {
    lines.push("");
    lines.push("Canonical core (the structural backbone — keep thesis, argument_chain, emotional_arc consistent):");
    lines.push(jsonBlock(input.canonicalCore));
  }

  if (input.previousDraft) {
    lines.push("");
    lines.push("Previous draft (this is what the reviewer scored; sections flagged as critical MUST be substantively rewritten, not lightly edited):");
    lines.push(jsonBlock(input.previousDraft));
  }

  lines.push(channelBlock(input.channel));
  lines.push("");
  lines.push("Revision rules:");
  lines.push(
    "- Every CRITICAL issue must be resolved by substantive rewriting of the affected section. Do not preserve original wording in flagged sections — the reviewer will compare against the previous draft.",
  );
  lines.push(
    "- Address each critical issue at the location indicated; do not address it elsewhere.",
  );
  lines.push(
    "- Preserve the listed strengths and the canonical core's thesis/structure.",
  );
  lines.push(
    "- A revision that only rewords the previous draft will fail review again. Visible structural changes (new opening, broken-up sentences, removed promotional language, etc.) are expected.",
  );
  if (stubborn) {
    lines.push(
      "- Because earlier attempts failed to address these criticals, you may rewrite more aggressively this round, including replacing whole paragraphs.",
    );
  }
  lines.push("");
  lines.push(
    "Respond with a JSON object matching the output contract. No markdown, no commentary.",
  );
  return lines.join("\n");
}
