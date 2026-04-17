import { describe, it, expect } from 'vitest';
import { buildResearchMessage } from '../prompts/research.js';

describe('buildResearchMessage', () => {
  it('builds message with idea context', () => {
    const msg = buildResearchMessage({
      ideaId: 'BC-IDEA-001',
      ideaTitle: 'AI in healthcare',
      level: 'standard',
    });
    expect(msg).toContain('AI in healthcare');
    expect(msg).toContain('standard');
    expect(msg).toContain('JSON');
  });

  it('includes instruction when provided', () => {
    const msg = buildResearchMessage({
      ideaTitle: 'test',
      instruction: 'Focus on European market data',
    });
    expect(msg).toContain('Focus on European market data');
  });

  it('includes channel context', () => {
    const msg = buildResearchMessage({
      ideaTitle: 'test',
      channel: { name: 'BrightCurios', language: 'pt-BR' },
    });
    expect(msg).toContain('pt-BR');
  });

  it('includes core tension and audience', () => {
    const msg = buildResearchMessage({
      ideaTitle: 'test',
      coreTension: 'theory vs practice',
      targetAudience: 'senior developers',
    });
    expect(msg).toContain('theory vs practice');
    expect(msg).toContain('senior developers');
  });

  it('handles minimal input', () => {
    const msg = buildResearchMessage({});
    expect(msg).toContain('Research');
    expect(msg).toContain('JSON');
  });
});
