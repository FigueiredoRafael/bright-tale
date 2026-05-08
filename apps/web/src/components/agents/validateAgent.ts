import type { SectionsJson, SchemaField, PromptSchema } from '@brighttale/shared';

export interface AgentValidationError {
  scope: 'header' | 'inputSchema' | 'outputSchema' | 'rules' | 'customSections';
  path: string;
  message: string;
}

function validateFields(fields: SchemaField[] | unknown, path: string, errors: AgentValidationError[], scope: AgentValidationError['scope']) {
  if (!Array.isArray(fields)) {
    if (fields !== undefined && fields !== null) {
      errors.push({ scope, path, message: 'fields must be an array.' });
    }
    return;
  }
  const seen = new Set<string>();
  fields.forEach((field, i) => {
    const fieldPath = `${path}[${i}]`;
    const name = (field?.name ?? '').trim();
    if (!name) {
      errors.push({ scope, path: `${fieldPath}.name`, message: 'Field name is required.' });
    } else if (seen.has(name)) {
      errors.push({ scope, path: `${fieldPath}.name`, message: `Duplicate field "${name}" at this level.` });
    } else {
      seen.add(name);
    }
    if (field?.type === 'object' && field.fields !== undefined) {
      validateFields(field.fields, `${fieldPath}.fields`, errors, scope);
    }
    if (field?.type === 'array' && field.items?.type === 'object' && field.items.fields !== undefined) {
      validateFields(field.items.fields, `${fieldPath}.items.fields`, errors, scope);
    }
  });
}

function validateSchema(schema: PromptSchema, scope: 'inputSchema' | 'outputSchema', errors: AgentValidationError[]) {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  if (fields.length > 0 && !schema.name.trim()) {
    errors.push({ scope, path: 'name', message: 'Schema name is required when fields are defined.' });
  }
  validateFields(schema.fields, 'fields', errors, scope);
}

export function validateAgent(sections: SectionsJson, agentName: string): AgentValidationError[] {
  const errors: AgentValidationError[] = [];

  if (!agentName.trim()) {
    errors.push({ scope: 'header', path: 'name', message: 'Agent name is required.' });
  }
  if (!sections.header.role.trim()) {
    errors.push({ scope: 'header', path: 'role', message: 'Role is required.' });
  }

  validateSchema(sections.inputSchema, 'inputSchema', errors);
  validateSchema(sections.outputSchema, 'outputSchema', errors);

  sections.customSections.forEach((section, i) => {
    if (!section.title.trim()) {
      errors.push({ scope: 'customSections', path: `customSections[${i}].title`, message: 'Section title is required.' });
    }
  });

  return errors;
}

export function errorsByScope(errors: AgentValidationError[]): Record<AgentValidationError['scope'], AgentValidationError[]> {
  const out: Record<string, AgentValidationError[]> = {};
  for (const e of errors) {
    if (!out[e.scope]) out[e.scope] = [];
    out[e.scope].push(e);
  }
  return out as Record<AgentValidationError['scope'], AgentValidationError[]>;
}
