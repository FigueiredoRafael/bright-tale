import { describe, expect, it } from 'vitest';
import { resolveAutopilotConfig } from '../autopilot-config-resolver';

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
