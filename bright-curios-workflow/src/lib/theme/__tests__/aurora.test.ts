import { describe, it, expect } from 'vitest';
import { aurora } from '../aurora';

describe('aurora theme', () => {
  it('is a frozen object', () => {
    expect(Object.isFrozen(aurora)).toBe(true);
  });

  it('brand[500] is the Aurora teal', () => {
    expect(aurora.palette!.brand.scale[500]).toBe('#2DD4BF');
  });

  it('accent.main is the Aurora orange', () => {
    expect(aurora.palette!.accent.main).toBe('#FF6B35');
  });

  it('semantic light.primary equals palette brand[500]', () => {
    expect(aurora.colors.light.primary).toBe(aurora.palette!.brand.scale[500]);
  });

  it('semantic dark.background equals palette surfaces.dark.base', () => {
    expect(aurora.colors.dark.background).toBe(aurora.palette!.surfaces.dark.base);
  });

  it('shadows.glow carries the brand rgba', () => {
    expect(aurora.shadows!.glow).toContain('rgba(45,212,191');
  });

  it('typography.scale.display is 40/48/800', () => {
    const t = aurora.typography.scale!.display;
    expect(t.size).toBe('40px');
    expect(t.line).toBe('48px');
    expect(t.weight).toBe(800);
  });

  it('scales.radii.full is 9999px', () => {
    expect(aurora.scales!.radii!.full).toBe('9999px');
  });
});
