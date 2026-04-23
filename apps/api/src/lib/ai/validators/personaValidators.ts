/**
 * Persona-specific draft validators — enforce each persona's hard guardrails
 * beyond the universal vice rules. Keyed by persona slug.
 *
 * - cole-merritt: blunt operator, no second-person commands, no motivational
 *   list H2s, no "journey", no claimed revenue/MRR/runway numbers.
 * - alex-strand:  analyst, every stat needs adjacent attribution (source name
 *   or citation), no "studies show" without a link, no financial-advice tone.
 * - casey-park:   portfolio operator, "passive income" must be qualified,
 *   success-pattern claims must acknowledge survivorship bias.
 */

import type { ValidationFindings } from './types.js';
import { mergeFindings } from './types.js';

interface PersonaValidatorInput {
  fullDraft: string;
  affiliateCopy?: string;
  outline: Array<{ h2: string }>;
}

// ── Cole Merritt ─────────────────────────────────────────────────────────────

export function validateColeNoSecondPersonCommands(
  fullDraft: string,
  affiliateCopy?: string,
): string[] {
  const issues: string[] = [];
  const targets: Array<{ source: string; label: string }> = [
    { source: fullDraft, label: 'body' },
  ];
  if (affiliateCopy) targets.push({ source: affiliateCopy, label: 'affiliate copy' });

  const commandPatterns: Array<{ re: RegExp; example: string }> = [
    { re: /\byou\s+(should|need to|must|have to)\b/gi, example: 'you should/need to/must/have to' },
    { re: /\b(if you['']re\s+\w+,?\s+)?start\s+by\b/gi, example: 'start by …' },
    { re: /\b(if you['']re\s+\w+,?\s+)?begin\s+by\b/gi, example: 'begin by …' },
    { re: /^\s*(use|try|apply|do|build|create|measure|track)\s+\w+/gim, example: 'imperative opening' },
  ];

  for (const { source, label } of targets) {
    for (const { re, example } of commandPatterns) {
      const matches = source.match(re);
      if (matches && matches.length > 0) {
        issues.push(
          `Cole guardrail violated: ${matches.length}× second-person command (${example}) in ${label} — Cole presents what he did, never tells the reader what to do`,
        );
      }
    }
  }

  return issues;
}

export function validateColeNoMotivationalListH2(outline: Array<{ h2: string }>): string[] {
  const issues: string[] = [];
  for (const item of outline) {
    if (/^\s*\d+\s+(ways|tips|reasons|things|steps|hacks)\s+to\b/i.test(item.h2)) {
      issues.push(
        `Cole guardrail violated: H2 "${item.h2}" uses motivational list format — Cole argues positions, not enumerates tips`,
      );
    }
  }
  return issues;
}

export function validateColeNoJourneyWord(fullDraft: string): string[] {
  const matches = fullDraft.match(/\bjourney\b/gi);
  if (matches && matches.length > 0) {
    return [
      `Cole guardrail violated: word "journey" used ${matches.length}× — Cole bans the word entirely (it's a build, not a journey)`,
    ];
  }
  return [];
}

export function validateColeNoSpecificFinancialClaims(fullDraft: string): string[] {
  // Catches concrete revenue/MRR/runway/exit numbers Cole has agreed not to claim
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /\$\d[\d,]*(?:\.\d+)?\s*(K|M|MM|million|k\s+(MRR|ARR|in revenue))/gi, label: 'specific dollar amounts (e.g., $10K MRR)' },
    { re: /\b(MRR|ARR)\s+of\s+\$?\d/gi, label: 'MRR/ARR figure' },
    { re: /\b(runway|burn)\s+of\s+\d+\s+months?/gi, label: 'specific runway/burn duration' },
    { re: /\b(exit|acquisition)\s+(at|of|for)\s+\$\d/gi, label: 'exit/acquisition number' },
  ];

  const issues: string[] = [];
  for (const { re, label } of patterns) {
    const matches = fullDraft.match(re);
    if (matches && matches.length > 0) {
      issues.push(
        `Cole guardrail violated: ${matches.length}× ${label} — Cole never claims specific revenue/MRR/runway/exit numbers`,
      );
    }
  }
  return issues;
}

// ── Alex Strand ──────────────────────────────────────────────────────────────

export function validateAlexStatsHaveAttribution(fullDraft: string): string[] {
  // Stats: bolded percentages or dollar figures or "Nx" multipliers
  // Attribution: a source name (capitalized multi-word phrase like "McKinsey",
  // "Bessemer Venture Partners", "BCG", "Sequoia"), a URL, or an inline link
  // within ±2 sentences of the stat.
  const sentences = fullDraft
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const statPattern = /\*\*[^*]*?(?:\d+(?:\.\d+)?\s*%|\$\s*\d|\d+\s*x|\d+\s*-\s*\d+\s+(?:minutes|hours|days))[^*]*?\*\*/i;
  const attributionPattern = /(?:McKinsey|Bessemer|Andreessen|Horowitz|a16z|Sequoia|BCG|NFX|Gartner|Forrester|HBR|Harvard|Stanford|MIT|\baccording to\b|\(([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+\d{4})\)|https?:\/\/)/;

  const issues: string[] = [];
  let badStatCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    if (!statPattern.test(sentences[i])) continue;
    const window = [sentences[i - 2], sentences[i - 1], sentences[i], sentences[i + 1], sentences[i + 2]]
      .filter(Boolean)
      .join(' ');
    if (!attributionPattern.test(window)) {
      badStatCount++;
    }
  }

  if (badStatCount > 0) {
    issues.push(
      `Alex guardrail violated: ${badStatCount} stat block(s) lack adjacent source attribution (within ±2 sentences) — Alex never presents a number without its assumption set`,
    );
  }

  return issues;
}

export function validateAlexNoStudiesShowWithoutCitation(fullDraft: string): string[] {
  const phrases = [/\bstudies show\b/gi, /\bresearch shows\b/gi, /\bexperts say\b/gi, /\bdata shows\b/gi];
  const issues: string[] = [];
  const linkPattern = /\[[^\]]+\]\([^)]+\)|https?:\/\//;

  for (const re of phrases) {
    const matches = [...fullDraft.matchAll(re)];
    for (const match of matches) {
      // Look 80 chars after the match for a link
      const after = fullDraft.slice(match.index ?? 0, (match.index ?? 0) + 200);
      if (!linkPattern.test(after)) {
        const phrase = match[0];
        issues.push(
          `Alex guardrail violated: "${phrase}" used without an inline link/citation within the same sentence`,
        );
      }
    }
  }

  return issues;
}

export function validateAlexNoFinancialAdvice(fullDraft: string): string[] {
  // Imperative financial-advice patterns Alex has agreed not to use
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /\b(invest|buy|sell|put your money)\s+in\s+\w+/gi, label: 'imperative investment direction' },
    { re: /\byou\s+should\s+(invest|buy|save|earn|spend)\b/gi, label: '"you should" + financial verb' },
    { re: /\b(this is|here is)\s+(the|a)\s+best\s+(investment|strategy|portfolio)\b/gi, label: 'prescriptive "best investment/strategy"' },
  ];

  const issues: string[] = [];
  for (const { re, label } of patterns) {
    const matches = fullDraft.match(re);
    if (matches && matches.length > 0) {
      issues.push(
        `Alex guardrail violated: ${matches.length}× ${label} — Alex presents models/methodology, never prescriptions`,
      );
    }
  }
  return issues;
}

// ── Casey Park ───────────────────────────────────────────────────────────────

export function validateCaseyPassiveIncomeQualified(fullDraft: string): string[] {
  const issues: string[] = [];
  const matches = [...fullDraft.matchAll(/\bpassive income\b/gi)];
  if (matches.length === 0) return issues;

  const qualifierPattern = /\b(low-maintenance|still requires?|maintenance still|not (?:fully|truly) passive|requires?\s+ongoing|still needs?)\b/i;

  for (const match of matches) {
    const idx = match.index ?? 0;
    // Window: sentence containing the match plus next sentence (~250 chars)
    const window = fullDraft.slice(Math.max(0, idx - 50), idx + 300);
    if (!qualifierPattern.test(window)) {
      issues.push(
        `Casey guardrail violated: "passive income" used without qualifier (low-maintenance / still requires / not fully passive) within nearby context`,
      );
    }
  }

  return issues;
}

export function validateCaseyAcknowledgesSurvivorshipBias(fullDraft: string): string[] {
  // Heuristic: if the draft mentions success patterns ("the winners", "successful X", "what worked")
  // it should also mention survivorship bias somewhere.
  const successSignals = /\b(winners|the (?:best|top)|successful (?:startups|companies|founders|products)|what worked|case studies|breakout)/i;
  const acknowledgesBias = /\bsurvivorship bias\b/i;

  if (successSignals.test(fullDraft) && !acknowledgesBias.test(fullDraft)) {
    return [
      `Casey guardrail violated: post analyzes success patterns but never acknowledges survivorship bias — Casey requires this caveat for every success-pattern analysis`,
    ];
  }
  return [];
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function runPersonaValidators(
  personaSlug: string | null | undefined,
  input: PersonaValidatorInput,
): ValidationFindings {
  const { fullDraft, affiliateCopy, outline } = input;

  if (!personaSlug) {
    return { critical: [], important: [], minor: [] };
  }

  switch (personaSlug) {
    case 'cole-merritt':
      return mergeFindings({
        critical: [
          ...validateColeNoSecondPersonCommands(fullDraft, affiliateCopy),
          ...validateColeNoSpecificFinancialClaims(fullDraft),
        ],
        important: [
          ...validateColeNoJourneyWord(fullDraft),
          ...validateColeNoMotivationalListH2(outline),
        ],
        minor: [],
      });

    case 'alex-strand':
      return mergeFindings({
        critical: [
          ...validateAlexStatsHaveAttribution(fullDraft),
        ],
        important: [
          ...validateAlexNoStudiesShowWithoutCitation(fullDraft),
          ...validateAlexNoFinancialAdvice(fullDraft),
        ],
        minor: [],
      });

    case 'casey-park':
      return mergeFindings({
        critical: [
          ...validateCaseyPassiveIncomeQualified(fullDraft),
        ],
        important: [
          ...validateCaseyAcknowledgesSurvivorshipBias(fullDraft),
        ],
        minor: [],
      });

    default:
      return { critical: [], important: [], minor: [] };
  }
}
