export const STANDARD_JSON_RULES = [
  'Output must be valid JSON, parseable by JSON.parse()',
  'No em-dashes (—), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
  'Use literal newlines in string values for multi-line content',
];

export const STANDARD_CONTENT_RULES = [
  'Do not invent statistics. If the research did not validate a claim, do not include it.',
  'Every quote must include attribution and source_id.',
  'Do not add, remove, or rename keys in the output schema.',
  'ALL output text must be in the language specified in the user message. If no language specified, default to English.',
  'Adapt cultural references, idioms, and examples for the specified region/audience.',
];

export const STANDARD_VALIDATION_RULES = [
  'Verify every required field is populated.',
  'Verify no placeholder text like "TBD" or "lorem ipsum" remains.',
  'Verify array lengths match the requested count.',
];

export interface RuleLibraryEntry {
  category: 'formatting' | 'content' | 'validation';
  label: string;
  rules: readonly string[];
}

export const RULE_LIBRARY: readonly RuleLibraryEntry[] = [
  { category: 'formatting', label: 'Standard JSON', rules: STANDARD_JSON_RULES },
  { category: 'content', label: 'Standard Content', rules: STANDARD_CONTENT_RULES },
  { category: 'validation', label: 'Standard Validation', rules: STANDARD_VALIDATION_RULES },
];
