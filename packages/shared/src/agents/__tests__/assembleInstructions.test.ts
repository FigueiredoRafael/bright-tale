// packages/shared/src/agents/__tests__/assembleInstructions.test.ts
import { describe, it, expect } from 'vitest';
import { assembleInstructions, buildSchemaExample } from '../assembleInstructions';
import type { SectionsJson, SchemaField } from '../types';

describe('buildSchemaExample', () => {
  it('builds a flat JSON example from fields', () => {
    const fields: SchemaField[] = [
      { name: 'idea_id', type: 'string', required: true, description: 'UUID of the idea' },
      { name: 'score', type: 'number', required: false, description: 'Quality score' },
    ];
    const result = buildSchemaExample(fields);
    const parsed = JSON.parse(result);
    expect(parsed.idea_id).toBe('');
    expect(parsed.score).toBe(0);
  });

  it('builds nested object fields', () => {
    const fields: SchemaField[] = [
      {
        name: 'monetization_hypothesis',
        type: 'object',
        required: true,
        description: 'Money stuff',
        fields: [
          { name: 'affiliate_angle', type: 'string', required: true, description: '' },
        ],
      },
    ];
    const result = buildSchemaExample(fields);
    const parsed = JSON.parse(result);
    expect(parsed.monetization_hypothesis.affiliate_angle).toBe('');
  });

  it('builds array of objects', () => {
    const fields: SchemaField[] = [
      {
        name: 'steps',
        type: 'array',
        required: true,
        description: 'Steps',
        items: {
          type: 'object',
          fields: [
            { name: 'claim', type: 'string', required: true, description: '' },
          ],
        },
      },
    ];
    const result = buildSchemaExample(fields);
    const parsed = JSON.parse(result);
    expect(parsed.steps).toEqual([{ claim: '' }]);
  });

  it('builds array of primitives', () => {
    const fields: SchemaField[] = [
      { name: 'tags', type: 'array', required: true, description: 'Tags', items: { type: 'string' } },
    ];
    const result = buildSchemaExample(fields);
    const parsed = JSON.parse(result);
    expect(parsed.tags).toEqual(['']);
  });
});

describe('assembleInstructions', () => {
  const minimal: SectionsJson = {
    header: {
      role: 'You are a test agent.',
      context: 'Testing context.',
      principles: ['Be accurate'],
      purpose: ['Generate test output'],
    },
    inputSchema: {
      name: 'BC_TEST_INPUT',
      fields: [
        { name: 'title', type: 'string', required: true, description: 'The title' },
      ],
    },
    outputSchema: {
      name: 'BC_TEST_OUTPUT',
      fields: [
        { name: 'result', type: 'string', required: true, description: 'The result' },
      ],
    },
    rules: {
      formatting: ['Output must be valid JSON'],
      content: ['Be concise'],
      validation: ['Verify result is non-empty'],
    },
    customSections: [],
  };

  it('assembles a complete prompt', () => {
    const result = assembleInstructions(minimal);
    expect(result).toContain('You are a test agent.');
    expect(result).toContain('Testing context.');
    expect(result).toContain('Be accurate');
    expect(result).toContain('Generate test output');
    expect(result).toContain('## Input Schema (BC_TEST_INPUT)');
    expect(result).toContain('"title": ""');
    expect(result).toContain('## Output Schema (BC_TEST_OUTPUT)');
    expect(result).toContain('## Rules');
    expect(result).toContain('Output must be valid JSON');
    expect(result).toContain('Be concise');
    expect(result).toContain('Verify result is non-empty');
  });

  it('includes custom sections', () => {
    const withCustom = {
      ...minimal,
      customSections: [{ title: 'Target Length', content: 'Keep it under 1000 words.' }],
    };
    const result = assembleInstructions(withCustom);
    expect(result).toContain('## Target Length');
    expect(result).toContain('Keep it under 1000 words.');
  });

  it('ends with JSON output instruction', () => {
    const result = assembleInstructions(minimal);
    expect(result).toContain('Output must be valid JSON. No markdown fences, no commentary.');
  });

  it('skips empty header blocks instead of rendering empty tags', () => {
    const sparse: SectionsJson = {
      header: { role: 'You are a test agent.', context: '', principles: [], purpose: [] },
      inputSchema: { name: '', fields: [] },
      outputSchema: { name: '', fields: [] },
      rules: { formatting: [], content: [], validation: [] },
      customSections: [],
    };
    const result = assembleInstructions(sparse);
    expect(result).not.toContain('<context>');
    expect(result).not.toContain('<guiding principles>');
    expect(result).not.toContain('<purpose>');
    expect(result).not.toContain('<specific for the agent purpose>');
    expect(result).toContain('<role>');
    expect(result).toContain('You are a test agent.');
  });

  it('renders all header blocks when populated', () => {
    const result = assembleInstructions(minimal);
    expect(result).toContain('<role>');
    expect(result).toContain('<context>');
    expect(result).toContain('<guiding principles>');
    expect(result).toContain('<purpose>');
  });
});
