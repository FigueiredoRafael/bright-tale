import { describe, it, expect } from 'vitest';
import {
  updatePipelineSettingsSchema,
  updateCreditSettingsSchema,
  pipelineSettingsResponseSchema,
  creditSettingsResponseSchema,
} from '../pipeline-settings';

describe('updatePipelineSettingsSchema', () => {
  it('accepts valid partial update', () => {
    const result = updatePipelineSettingsSchema.safeParse({ reviewRejectThreshold: 35 });
    expect(result.success).toBe(true);
  });

  it('rejects score outside 0–100', () => {
    const result = updatePipelineSettingsSchema.safeParse({ reviewApproveScore: 150 });
    expect(result.success).toBe(false);
  });

  it('rejects negative iterations', () => {
    const result = updatePipelineSettingsSchema.safeParse({ reviewMaxIterations: -1 });
    expect(result.success).toBe(false);
  });
});

describe('updateCreditSettingsSchema', () => {
  it('accepts valid partial update', () => {
    const result = updateCreditSettingsSchema.safeParse({ costBlog: 300 });
    expect(result.success).toBe(true);
  });

  it('rejects negative cost', () => {
    const result = updateCreditSettingsSchema.safeParse({ costBlog: -10 });
    expect(result.success).toBe(false);
  });
});

describe('pipelineSettingsResponseSchema', () => {
  it('parses complete row', () => {
    const result = pipelineSettingsResponseSchema.safeParse({
      reviewRejectThreshold: 40,
      reviewApproveScore: 90,
      reviewMaxIterations: 5,
      defaultProviders: { brainstorm: 'gemini', research: 'gemini', draft: 'gemini', review: 'gemini' },
    });
    expect(result.success).toBe(true);
  });
});
