/**
 * Universal draft validators — format-agnostic checks for blog/video/shorts/podcast
 * outputs. Catch hard schema violations (Sources, headings) and the universal
 * AI-vice patterns (em-dashes as filler, "Not X, but Y" overuse, banned words).
 *
 * Each named validator is exported for unit testing. `runDraftValidators` is the
 * single entry point used by the produce flow + Review engine.
 */

import type {
  DraftValidatorInput,
  CanonicalCoreLike,
  OutlineEntry,
  ValidationFindings,
} from './types.js';
import { mergeFindings } from './types.js';

// ── Critical: Sources section + heading hierarchy ────────────────────────────

export function validateSources(
  fullDraft: string,
  canonicalCore: CanonicalCoreLike,
): string[] {
  const issues: string[] = [];
  const sourcesMatch = fullDraft.match(/^##\s+Sources\s*\n([\s\S]*)$/m);

  if (!sourcesMatch) {
    issues.push('Missing "## Sources" section at end of full_draft');
    return issues;
  }

  const sourcesBody = sourcesMatch[1].trim();
  if (sourcesBody.length === 0) {
    issues.push('"## Sources" section exists but is empty');
    return issues;
  }

  const sourceLines = sourcesBody
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '));

  if (sourceLines.length === 0) {
    issues.push('"## Sources" section has no list items (expected lines starting with "- ")');
    return issues;
  }

  const referencedIds = new Set<string>();
  for (const step of canonicalCore.argument_chain ?? []) {
    for (const id of step.source_ids ?? []) {
      if (id) referencedIds.add(id);
    }
  }
  for (const stat of canonicalCore.key_stats ?? []) {
    if (stat.source_id) referencedIds.add(stat.source_id);
  }

  if (referencedIds.size > 0 && sourceLines.length < referencedIds.size) {
    issues.push(
      `"## Sources" has ${sourceLines.length} entries but ${referencedIds.size} unique source_ids are referenced in canonical core`,
    );
  }

  return issues;
}

export function validateSourcesFormat(fullDraft: string): string[] {
  const issues: string[] = [];
  const sourcesMatch = fullDraft.match(/^##\s+Sources\s*\n([\s\S]*)$/m);
  if (!sourcesMatch) return issues; // covered by validateSources

  const lines = sourcesMatch[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '));

  for (const line of lines) {
    if (/^- S\d+:/i.test(line)) {
      issues.push(`Sources line uses forbidden "Sx:" prefix: "${line}"`);
      continue;
    }
    if (/\[\s*\[/.test(line) || /\(\s*\[/.test(line)) {
      issues.push(`Sources line has nested markdown link: "${line}"`);
      continue;
    }
    const formatMatch = line.match(/^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/);
    if (!formatMatch) {
      issues.push(`Sources line not in "- [title](url)" format: "${line}"`);
    }
  }

  return issues;
}

export function validateHeadings(fullDraft: string, outline: OutlineEntry[]): string[] {
  const issues: string[] = [];
  if (outline.length === 0) return issues;

  const lines = fullDraft.split('\n');

  for (const item of outline) {
    const h2 = (item.h2 ?? '').trim();
    if (!h2) continue;

    const matchingLines = lines.filter((l) => l.includes(h2) && /^#+\s/.test(l.trim()));
    if (matchingLines.length === 0) {
      issues.push(`Outline H2 "${h2}" not found as any heading in full_draft`);
      continue;
    }

    const correctlyFormatted = matchingLines.some((l) => /^##\s+/.test(l.trim()) && !/^###\s/.test(l.trim()));
    if (!correctlyFormatted) {
      const wrongLevel = matchingLines.find((l) => /^###\s/.test(l.trim()))?.trim().slice(0, 80);
      issues.push(
        `Outline H2 "${h2}" rendered with wrong heading level (expected "## ", got "${wrongLevel ?? 'unknown'}")`,
      );
    }
  }

  return issues;
}

// ── Important: pattern overuse ───────────────────────────────────────────────

export function validateNotXButY(fullDraft: string): string[] {
  // Sentence-level analysis catches three rhetorical-pattern variants that
  // LLMs commonly overuse:
  //   A. "X is not Y." + next sentence starts with "It is / But / Just / The X"
  //   B. "Not X." + next sentence starts with "Not Y."
  //   C. "Not X, but Y." within a single sentence
  const sentences = fullDraft
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let count = 0;

  for (let i = 0; i < sentences.length - 1; i++) {
    const cur = sentences[i].toLowerCase();
    const next = sentences[i + 1].toLowerCase();

    // Pattern A: current ends with "is not <something>", next starts with a reframe pivot
    if (/\b(is|are|was|were)\s+not\b/.test(cur) && /^(it is|that is|the\s+\w+\s+is|but |just |the real|not\s)/.test(next)) {
      count++;
      continue;
    }

    // Pattern B: parallel "Not ..." sentences
    if (/^not\s+/i.test(cur) && /^not\s+/i.test(next)) {
      count++;
    }
  }

  // Pattern C: inline "Not X, but Y"
  const inlineMatches = fullDraft.match(/\bnot\s+[^.?!,]{3,40},\s+but\s+/gi) ?? [];
  count += inlineMatches.length;

  if (count > 1) {
    return [
      `"Not X / but Y" rhetorical pattern detected ${count} times (universal vice rule: max 1 per post)`,
    ];
  }
  return [];
}

export function validateSignaturePhraseUsage(
  fullDraft: string,
  signaturePhrases: string[],
): string[] {
  const issues: string[] = [];

  for (const phrase of signaturePhrases) {
    const trimmed = phrase?.trim();
    if (!trimmed) continue;

    // Escape regex metachars; tolerate straight vs curly apostrophes
    const escaped = trimmed
      .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
      .replace(/['']/g, "['']");

    const re = new RegExp(escaped, 'gi');
    const count = (fullDraft.match(re) ?? []).length;
    if (count > 2) {
      issues.push(
        `Persona signature phrase "${trimmed}" used ${count}× (max 2 — keep usage natural, not mechanical)`,
      );
    }
  }

  return issues;
}

// ── Minor: surface-level vice patterns ──────────────────────────────────────

export function validateEmDashFiller(fullDraft: string): string[] {
  // Em-dashes (—) inside quote-attribution lines (lines starting with ">" or
  // immediately following a blockquote) are legitimate. Em-dashes elsewhere
  // are likely filler.
  const lines = fullDraft.split('\n');
  let fillerCount = 0;
  let prevWasQuote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isQuote = trimmed.startsWith('>');
    if (isQuote) {
      prevWasQuote = true;
      continue;
    }
    // The line right after a blockquote is often the attribution — skip too
    if (prevWasQuote && trimmed.length === 0) continue;
    if (prevWasQuote) {
      prevWasQuote = false;
      continue;
    }
    fillerCount += (line.match(/—/g) ?? []).length;
  }

  if (fillerCount > 3) {
    return [
      `Em-dash (—) used ${fillerCount}× outside quote attributions (universal vice rule: avoid em-dashes as filler)`,
    ];
  }
  return [];
}

export function validateBannedWords(fullDraft: string): string[] {
  const issues: string[] = [];

  const banned: Array<{ pattern: RegExp; label: string; severity: 'flag' }> = [
    { pattern: /\bjourney\b/gi, label: '"journey" — banned as metaphor + Cole-persona ban', severity: 'flag' },
    { pattern: /\bessence\b/gi, label: '"essence" as metaphor', severity: 'flag' },
    { pattern: /\buniverse\s+(of|where)/gi, label: '"universe of/where" as metaphor', severity: 'flag' },
    { pattern: /^[\s>]*furthermore[,\s]/gim, label: 'paragraph starts with "furthermore"', severity: 'flag' },
    { pattern: /^[\s>]*moreover[,\s]/gim, label: 'paragraph starts with "moreover"', severity: 'flag' },
    { pattern: /^[\s>]*on the other hand[,\s]/gim, label: 'paragraph starts with "on the other hand"', severity: 'flag' },
    { pattern: /^[\s>]*in addition[,\s]/gim, label: 'paragraph starts with "in addition"', severity: 'flag' },
    { pattern: /\bit['']s important to\b/gi, label: '"It\'s important to" sentence opening', severity: 'flag' },
    { pattern: /\bit['']s essential to\b/gi, label: '"It\'s essential to" sentence opening', severity: 'flag' },
  ];

  for (const { pattern, label } of banned) {
    const matches = fullDraft.match(pattern);
    if (matches && matches.length > 0) {
      issues.push(`Found ${matches.length}× ${label}`);
    }
  }

  return issues;
}

export function validateHollowAdjectives(fullDraft: string): string[] {
  // Hollow adjectives flagged only when not adjacent to specific evidence
  // (numbers, source names, %, $). Conservative — flags all uses for review.
  const issues: string[] = [];
  const hollow = ['fascinating', 'incredible', 'essential', 'remarkable', 'significant'];
  for (const adj of hollow) {
    const re = new RegExp(`\\b${adj}\\b`, 'gi');
    const count = (fullDraft.match(re) ?? []).length;
    if (count > 0) {
      issues.push(
        `Hollow adjective "${adj}" used ${count}× — verify each instance is justified by adjacent evidence (number, citation, specific example)`,
      );
    }
  }
  return issues;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function runDraftValidators(input: DraftValidatorInput): ValidationFindings {
  const { fullDraft, outline, canonicalCore, signaturePhrases } = input;

  const critical: string[] = [
    ...validateSources(fullDraft, canonicalCore),
    ...validateSourcesFormat(fullDraft),
    ...validateHeadings(fullDraft, outline),
  ];

  const important: string[] = [
    ...validateNotXButY(fullDraft),
    ...validateSignaturePhraseUsage(fullDraft, signaturePhrases),
  ];

  const minor: string[] = [
    ...validateEmDashFiller(fullDraft),
    ...validateBannedWords(fullDraft),
    ...validateHollowAdjectives(fullDraft),
  ];

  return mergeFindings({ critical, important, minor });
}
