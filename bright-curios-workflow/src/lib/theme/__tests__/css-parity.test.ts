import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { aurora } from '../aurora';

// Vitest sets process.cwd() to the package root where vitest.config.ts lives.
// This avoids ESM pitfalls with __dirname / import.meta.url path handling.
const cssPath = join(process.cwd(), 'src', 'app', 'globals.css');
const css = readFileSync(cssPath, 'utf-8');

type Scope = 'theme' | 'root' | 'dark';

function extractBlock(scope: Scope): string {
  if (scope === 'theme') {
    const m = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
    return m ? m[1] : '';
  }
  if (scope === 'root') {
    const m = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    return m ? m[1] : '';
  }
  const m = css.match(/\.dark\s*\{([\s\S]*?)\n\}/);
  return m ? m[1] : '';
}

function getVar(varName: string, scope: Scope): string | null {
  const block = extractBlock(scope);
  if (!block) return null;
  const escaped = varName.replace(/-/g, '\\-');
  const line = block.match(new RegExp(`^\\s*${escaped}\\s*:\\s*([^;]+);`, 'm'));
  return line ? line[1].trim() : null;
}

describe('globals.css ↔ aurora.ts parity', () => {
  it('@theme --color-brand-500 matches aurora brand[500]', () => {
    expect(getVar('--color-brand-500', 'theme')).toBe(aurora.palette!.brand.scale[500]);
  });

  it('@theme --color-success matches aurora semantic.success', () => {
    expect(getVar('--color-success', 'theme')).toBe(aurora.palette!.semantic.success);
  });

  it('@theme --color-vivid-teal matches aurora vivid.teal', () => {
    expect(getVar('--color-vivid-teal', 'theme')).toBe(aurora.palette!.vivid.teal);
  });

  it('@theme --radius-lg matches aurora scales.radii.lg', () => {
    expect(getVar('--radius-lg', 'theme')).toBe(aurora.scales!.radii!.lg);
  });

  it('@theme --shadow-md matches aurora shadows.md', () => {
    expect(getVar('--shadow-md', 'theme')).toBe(aurora.shadows!.md);
  });

  it(':root --primary matches aurora colors.light.primary', () => {
    expect(getVar('--primary', 'root')).toBe(aurora.colors.light.primary);
  });

  it(':root --accent matches aurora colors.light.accent', () => {
    expect(getVar('--accent', 'root')).toBe(aurora.colors.light.accent);
  });

  it('.dark --background matches aurora colors.dark.background', () => {
    expect(getVar('--background', 'dark')).toBe(aurora.colors.dark.background);
  });

  it(':root --color-surface-card matches aurora surfaces.light.card', () => {
    expect(getVar('--color-surface-card', 'root')).toBe(aurora.palette!.surfaces.light.card);
  });

  it('.dark --color-surface-card matches aurora surfaces.dark.card', () => {
    expect(getVar('--color-surface-card', 'dark')).toBe(aurora.palette!.surfaces.dark.card);
  });
});
