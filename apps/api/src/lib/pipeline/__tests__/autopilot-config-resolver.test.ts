import { describe, expect, it } from 'vitest';
import { resolveAutopilotConfig, slotToStageInput } from '../autopilot-config-resolver.js';

describe('resolveAutopilotConfig', () => {
  describe('project-only config (no Track override)', () => {
    it('returns project slot for required stage', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          canonicalCore: {
            providerOverride: null,
            modelOverride: null,
            personaId: 'persona-1',
          },
        },
      };
      const resolved = resolveAutopilotConfig(project, null, 'canonical');
      expect(resolved).toEqual({
        providerOverride: null,
        modelOverride: null,
        personaId: 'persona-1',
      });
    });

    it('returns project slot for nullable brainstorm stage', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          brainstorm: {
            providerOverride: null,
            modelOverride: null,
            mode: 'topic_driven',
            topic: 'AI',
          },
        },
      };
      const resolved = resolveAutopilotConfig(project, null, 'brainstorm');
      expect(resolved).toMatchObject({ mode: 'topic_driven', topic: 'AI' });
    });
  });

  describe('project + track override', () => {
    it('overlays track values on top of project values for the requested stage', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          review: {
            providerOverride: null,
            modelOverride: null,
            maxIterations: 3,
            autoApproveThreshold: 90,
            hardFailThreshold: 50,
          },
        },
      };
      const track = {
        autopilotConfigJson: {
          review: { autoApproveThreshold: 80 },
        },
      };
      const resolved = resolveAutopilotConfig(project, track, 'review');
      expect(resolved).toEqual({
        providerOverride: null,
        modelOverride: null,
        maxIterations: 3,
        autoApproveThreshold: 80,
        hardFailThreshold: 50,
      });
    });

    it('track override only applies to its own stage; other stages fall back to project', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          review: {
            providerOverride: null,
            modelOverride: null,
            maxIterations: 3,
            autoApproveThreshold: 90,
            hardFailThreshold: 50,
          },
          assets: {
            providerOverride: null,
            modelOverride: null,
            mode: 'briefs_only' as const,
          },
        },
      };
      const track = {
        autopilotConfigJson: {
          review: { maxIterations: 5 },
        },
      };
      const assets = resolveAutopilotConfig(project, track, 'assets');
      expect(assets).toMatchObject({ mode: 'briefs_only' });
    });
  });

  describe('missing config', () => {
    it('returns FALLBACK_BY_STAGE when neither project nor track configures the stage', () => {
      const resolved = resolveAutopilotConfig(null, null, 'production');
      expect(resolved).toEqual({
        providerOverride: null,
        modelOverride: null,
        format: 'blog',
        wordCount: 1000,
      });
    });

    it('returns null for nullable brainstorm when neither side configures it', () => {
      const resolved = resolveAutopilotConfig(null, null, 'brainstorm');
      expect(resolved).toBeNull();
    });

    it('returns null for nullable research when neither side configures it', () => {
      const resolved = resolveAutopilotConfig(null, null, 'research');
      expect(resolved).toBeNull();
    });
  });

  describe('null track (shared stages)', () => {
    it('null track is equivalent to no track override', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          canonicalCore: {
            providerOverride: null,
            modelOverride: null,
            personaId: 'persona-1',
          },
        },
      };
      expect(resolveAutopilotConfig(project, null, 'canonical')).toEqual(
        resolveAutopilotConfig(project, { autopilotConfigJson: {} }, 'canonical'),
      );
    });
  });

  describe('explicit null override', () => {
    it('track explicitly nulls a nullable stage to disable it', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          brainstorm: {
            providerOverride: null,
            modelOverride: null,
            mode: 'topic_driven',
            topic: 'AI',
          },
        },
      };
      const track = {
        autopilotConfigJson: { brainstorm: null },
      };
      const resolved = resolveAutopilotConfig(project, track, 'brainstorm');
      expect(resolved).toBeNull();
    });
  });

  describe('stage that does not exist in either', () => {
    it('falls back to defaults when neither side mentions the stage', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          // brainstorm provided, but we ask for preview
          brainstorm: {
            providerOverride: null,
            modelOverride: null,
            mode: 'topic_driven',
            topic: 'AI',
          },
        },
      };
      const resolved = resolveAutopilotConfig(project, null, 'preview');
      expect(resolved).toEqual({ enabled: false });
    });
  });

  describe('Stage→slot key mapping', () => {
    it('canonical Stage maps to canonicalCore slot key', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          canonicalCore: {
            providerOverride: null,
            modelOverride: null,
            personaId: 'persona-x',
          },
        },
      };
      const resolved = resolveAutopilotConfig(project, null, 'canonical');
      expect(resolved).toMatchObject({ personaId: 'persona-x' });
    });

    it('production Stage maps to draft slot key', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          draft: {
            providerOverride: null,
            modelOverride: null,
            format: 'blog' as const,
            wordCount: 800,
          },
        },
      };
      const resolved = resolveAutopilotConfig(project, null, 'production');
      expect(resolved).toMatchObject({ wordCount: 800 });
    });
  });

  describe('type-safe coalesce', () => {
    it('preserves slot fields from fallback that the patch does not override', () => {
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          assets: {
            // Only override the mode; provider fields should remain
            mode: 'auto_generate',
          },
        },
      };
      const resolved = resolveAutopilotConfig(project, null, 'assets');
      expect(resolved).toEqual({
        providerOverride: null,
        modelOverride: null,
        mode: 'auto_generate',
        imageScope: 'all',
      });
    });

    it('treats stored JSONB as opaque (validation is the PATCH endpoint job)', () => {
      // Resolver does NOT re-validate. A malformed shape is returned as-is;
      // it is the caller's responsibility to validate before dispatching the
      // stage_run. This keeps the resolver pure and side-effect-free.
      const project = {
        autopilotConfigJson: {
          defaultProvider: 'recommended',
          review: { maxIterations: 7 },
        },
      };
      const resolved = resolveAutopilotConfig(project, null, 'review');
      expect(resolved).toMatchObject({ maxIterations: 7 });
    });
  });
});

describe('resolveAutopilotConfig — schema versioning (BRI-29)', () => {
  it('legacy blob (no _v) flows through without throwing and still resolves correctly', () => {
    const project = {
      autopilotConfigJson: {
        canonicalCore: {
          providerOverride: null,
          modelOverride: null,
          personaId: 'persona-legacy',
        },
      },
    };
    expect(() => resolveAutopilotConfig(project, null, 'canonical')).not.toThrow();
    const resolved = resolveAutopilotConfig(project, null, 'canonical');
    expect(resolved).toMatchObject({ personaId: 'persona-legacy' });
  });

  it('blob with _v: 999 (future) does not throw and still resolves correctly', () => {
    const project = {
      autopilotConfigJson: {
        _v: 999,
        review: {
          providerOverride: null,
          modelOverride: null,
          maxIterations: 7,
          autoApproveThreshold: 95,
          hardFailThreshold: 50,
        },
      },
    };
    expect(() => resolveAutopilotConfig(project, null, 'review')).not.toThrow();
    const resolved = resolveAutopilotConfig(project, null, 'review');
    expect(resolved).toMatchObject({ maxIterations: 7, autoApproveThreshold: 95 });
  });

  it('track blob with _v: 999 does not throw and track override applies correctly', () => {
    const project = {
      autopilotConfigJson: {
        review: {
          providerOverride: null,
          modelOverride: null,
          maxIterations: 3,
          autoApproveThreshold: 90,
          hardFailThreshold: 50,
        },
      },
    };
    const track = {
      autopilotConfigJson: {
        _v: 999,
        review: { autoApproveThreshold: 85 },
      },
    };
    expect(() => resolveAutopilotConfig(project, track, 'review')).not.toThrow();
    const resolved = resolveAutopilotConfig(project, track, 'review');
    expect(resolved).toMatchObject({ maxIterations: 3, autoApproveThreshold: 85 });
  });
});

describe('slotToStageInput', () => {
  it('maps providerOverride → provider and modelOverride → model', () => {
    const slot = {
      providerOverride: 'openai',
      modelOverride: 'gpt-4o-mini',
      mode: 'topic_driven',
      topic: 'x',
    };
    expect(slotToStageInput('brainstorm', slot)).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      mode: 'topic_driven',
      topic: 'x',
    });
  });

  it('drops null overrides instead of overwriting with null', () => {
    const slot = {
      providerOverride: null,
      modelOverride: null,
      mode: 'topic_driven',
    };
    const out = slotToStageInput('brainstorm', slot);
    expect(out).toEqual({ mode: 'topic_driven' });
    expect(out).not.toHaveProperty('provider');
    expect(out).not.toHaveProperty('providerOverride');
  });

  it('research: maps depth → level', () => {
    expect(slotToStageInput('research', { providerOverride: null, modelOverride: null, depth: 'deep' })).toEqual({
      level: 'deep',
    });
  });

  it('production: maps format → type', () => {
    expect(
      slotToStageInput('production', { providerOverride: 'anthropic', modelOverride: null, format: 'video', wordCount: 800 }),
    ).toEqual({
      provider: 'anthropic',
      type: 'video',
      wordCount: 800,
    });
  });

  it('returns null for null/undefined slot', () => {
    expect(slotToStageInput('brainstorm', null)).toBeNull();
    expect(slotToStageInput('brainstorm', undefined)).toBeNull();
  });

  it('explicit provider on input wins over override (manual API callers)', () => {
    const slot = {
      provider: 'gemini',
      providerOverride: 'openai',
      mode: 'topic_driven',
    };
    expect(slotToStageInput('brainstorm', slot)).toEqual({
      provider: 'gemini',
      mode: 'topic_driven',
    });
  });
});
