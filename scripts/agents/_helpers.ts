import type { SchemaField, SectionsJson } from '@brighttale/shared';

export function emptySections(): SectionsJson {
  return {
    header: { role: '', context: '', principles: [], purpose: [] },
    inputSchema: { name: '', fields: [] },
    outputSchema: { name: '', fields: [] },
    rules: { formatting: [], content: [], validation: [] },
    customSections: [],
  };
}

// Must stay in sync with packages/shared/src/agents/ruleLibrary.ts STANDARD_JSON_RULES.
// Duplicated here because tsx script execution resolves `@brighttale/shared` differently
// than Next.js and re-export from root index fails.
export const STANDARD_JSON_RULES = [
  'Output must be valid JSON, parseable by JSON.parse()',
  'No em-dashes (—), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
  'Use literal newlines in string values for multi-line content',
  'Escape all double quotes inside JSON string values with a backslash (\\"). Unescaped quotes inside strings will break JSON.parse().',
];

export function str(name: string, description: string, required = true): SchemaField {
  return { name, type: 'string', required, description };
}

export function num(name: string, description: string, required = true): SchemaField {
  return { name, type: 'number', required, description };
}

export function bool(name: string, description: string, required = true): SchemaField {
  return { name, type: 'boolean', required, description };
}

export function obj(name: string, description: string, fields: SchemaField[], required = true): SchemaField {
  return { name, type: 'object', required, description, fields };
}

export function arr(name: string, description: string, itemType: 'string' | 'number' | 'boolean', required = true): SchemaField {
  return { name, type: 'array', required, description, items: { type: itemType } };
}

export function arrOf(name: string, description: string, fields: SchemaField[], required = true): SchemaField {
  return { name, type: 'array', required, description, items: { type: 'object', fields } };
}

export const contentWarningField = (purpose = 'material') =>
  str(
    'content_warning',
    `Set if input ${purpose} is insufficient. Format: "Missing X — padding avoided." Leave empty when content is complete.`,
    false,
  );
