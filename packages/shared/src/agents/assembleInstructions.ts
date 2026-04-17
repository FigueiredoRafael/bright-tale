// packages/shared/src/agents/assembleInstructions.ts
import type { SectionsJson, SchemaField } from './types';

function defaultValue(type: SchemaField['type']): unknown {
  switch (type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
  }
}

function buildFieldExample(field: SchemaField): unknown {
  if (field.type === 'object' && field.fields?.length) {
    const obj: Record<string, unknown> = {};
    for (const f of field.fields) {
      obj[f.name] = buildFieldExample(f);
    }
    return obj;
  }
  if (field.type === 'array') {
    if (field.items?.type === 'object' && field.items.fields?.length) {
      const obj: Record<string, unknown> = {};
      for (const f of field.items.fields) {
        obj[f.name] = buildFieldExample(f);
      }
      return [obj];
    }
    if (field.items?.type) {
      return [defaultValue(field.items.type)];
    }
    return [];
  }
  return defaultValue(field.type);
}

export function buildSchemaExample(fields: SchemaField[]): string {
  const obj: Record<string, unknown> = {};
  for (const field of fields) {
    obj[field.name] = buildFieldExample(field);
  }
  return JSON.stringify(obj, null, 2);
}

export function assembleInstructions(sections: SectionsJson): string {
  const lines: string[] = [];

  // 1. Header
  lines.push(`<context>`);
  lines.push(sections.header.context);
  lines.push('');
  lines.push(`<role>`);
  lines.push(sections.header.role);
  lines.push('');
  lines.push(`<guiding principles>`);
  for (const p of sections.header.principles) {
    lines.push(`- ${p}`);
  }
  lines.push('');
  lines.push(`<specific for the agent purpose>`);
  for (const p of sections.header.purpose) {
    lines.push(`- ${p}`);
  }

  // 2. Input Schema
  if (sections.inputSchema.fields.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## Input Schema (${sections.inputSchema.name})`);
    lines.push('');
    lines.push('```json');
    lines.push(buildSchemaExample(sections.inputSchema.fields));
    lines.push('```');
  }

  // 3. Output Schema
  if (sections.outputSchema.fields.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## Output Schema (${sections.outputSchema.name})`);
    lines.push('');
    lines.push('```json');
    lines.push(buildSchemaExample(sections.outputSchema.fields));
    lines.push('```');
  }

  // 4. Rules
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Rules');
  if (sections.rules.formatting.length > 0) {
    lines.push('');
    lines.push('**JSON Formatting:**');
    lines.push('');
    for (const r of sections.rules.formatting) {
      lines.push(`- ${r}`);
    }
  }
  if (sections.rules.content.length > 0) {
    lines.push('');
    lines.push('**Content Rules:**');
    lines.push('');
    for (const r of sections.rules.content) {
      lines.push(`- ${r}`);
    }
  }
  if (sections.rules.validation.length > 0) {
    lines.push('');
    lines.push(`**Before finishing:** ${sections.rules.validation.join(' ')}`);
  }

  // 5. Custom Sections
  for (const section of sections.customSections) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.content);
  }

  // 6. Footer
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Output must be valid JSON. No markdown fences, no commentary.');

  return lines.join('\n');
}
