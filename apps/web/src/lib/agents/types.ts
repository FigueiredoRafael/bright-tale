// apps/web/src/lib/agents/types.ts

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  items?: {
    type?: 'string' | 'number' | 'boolean' | 'object';
    fields?: SchemaField[];
  };
  fields?: SchemaField[];
}

export interface PromptSchema {
  name: string;
  fields: SchemaField[];
}

export interface CustomSection {
  title: string;
  content: string;
}

export interface SectionsJson {
  header: {
    role: string;
    context: string;
    principles: string[];
    purpose: string[];
  };
  inputSchema: PromptSchema;
  outputSchema: PromptSchema;
  rules: {
    formatting: string[];
    content: string[];
    validation: string[];
  };
  customSections: CustomSection[];
}
