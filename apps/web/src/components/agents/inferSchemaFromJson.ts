import type { SchemaField } from '@brighttale/shared';

type Primitive = 'string' | 'number' | 'boolean';

function primitiveOf(value: unknown): Primitive | null {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return null;
}

function inferField(name: string, value: unknown): SchemaField {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return {
        name,
        type: 'array',
        required: true,
        description: '',
        items: { type: 'object', fields: inferSchemaFromJson(first) },
      };
    }
    const itemType = primitiveOf(first) ?? 'string';
    return { name, type: 'array', required: true, description: '', items: { type: itemType } };
  }
  if (value && typeof value === 'object') {
    return { name, type: 'object', required: true, description: '', fields: inferSchemaFromJson(value) };
  }
  const prim = primitiveOf(value) ?? 'string';
  return { name, type: prim, required: true, description: '' };
}

export function inferSchemaFromJson(obj: unknown): SchemaField[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj as Record<string, unknown>).map(([key, value]) => inferField(key, value));
}
