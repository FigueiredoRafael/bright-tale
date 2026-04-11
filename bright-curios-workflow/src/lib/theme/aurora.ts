import { createTheme, type AppTheme } from '@tn-figueiredo/shared/theme';

// ══ Reference palette — raw Aurora design tokens ══
const palette = {
  brand: {
    scale: {
      50:  '#E6FCFA',
      100: '#B2F5EA',
      200: '#81E6D9',
      300: '#4FD1C5',
      400: '#38B2AC',
      500: '#2DD4BF',
      600: '#0D9488',
      700: '#0F766E',
      800: '#115E59',
      900: '#134E4A',
    },
    foreground: '#FFFFFF',
  },
  accent: {
    main: '#FF6B35',
    hover: '#E85D2C',
    light: '#FFF0EB',
    foreground: '#FFFFFF',
  },
  surfaces: {
    dark: {
      base:     '#050A0D',
      surface:  '#0F1620',
      elevated: '#141E2A',
      card:     '#1A2535',
      border:   '#243348',
      text: {
        primary:   '#F1F5F9',
        secondary: '#94A3B8',
        muted:     '#64748B',
      },
    },
    light: {
      base:     '#F7F9FC',
      surface:  '#FFFFFF',
      elevated: '#FFFFFF',
      card:     '#FFFFFF',
      border:   '#E2E8F0',
      text: {
        primary:   '#0F172A',
        secondary: '#475569',
        muted:     '#94A3B8',
      },
    },
  },
  semantic: {
    success: '#22C55E',
    warning: '#F59E0B',
    error:   '#EF4444',
    info:    '#3B82F6',
  },
  vivid: {
    teal:   '#2DD4BF',
    cyan:   '#22D3EE',
    blue:   '#60A5FA',
    purple: '#A78BFA',
    orange: '#FF6B35',
    green:  '#34D399',
  },
} as const;

// ══ Semantic layer (shadcn interop) ══
const semanticLight = {
  background:          palette.surfaces.light.base,
  foreground:          palette.surfaces.light.text.primary,
  card:                palette.surfaces.light.card,
  cardForeground:      palette.surfaces.light.text.primary,
  primary:             palette.brand.scale[500],
  primaryForeground:   palette.brand.foreground,
  secondary:           palette.surfaces.light.surface,
  secondaryForeground: palette.surfaces.light.text.primary,
  muted:               palette.surfaces.light.surface,
  mutedForeground:     palette.surfaces.light.text.muted,
  accent:              palette.accent.main,
  accentForeground:    palette.accent.foreground,
  destructive:         palette.semantic.error,
  border:              palette.surfaces.light.border,
  ring:                palette.brand.scale[500],
} as const;

const semanticDark = {
  background:          palette.surfaces.dark.base,
  foreground:          palette.surfaces.dark.text.primary,
  card:                palette.surfaces.dark.card,
  cardForeground:      palette.surfaces.dark.text.primary,
  primary:             palette.brand.scale[500],
  primaryForeground:   '#0A1017',
  secondary:           palette.surfaces.dark.surface,
  secondaryForeground: palette.surfaces.dark.text.primary,
  muted:               palette.surfaces.dark.surface,
  mutedForeground:     palette.surfaces.dark.text.muted,
  accent:              palette.accent.main,
  accentForeground:    palette.accent.foreground,
  destructive:         palette.semantic.error,
  border:              palette.surfaces.dark.border,
  ring:                palette.brand.scale[500],
} as const;

const config: AppTheme = {
  colors: { light: semanticLight, dark: semanticDark },

  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24 },
  radii:   { sm: 4, md: 8, lg: 12, full: 9999 },

  typography: {
    fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
    fontSize:   { xs: 12, sm: 14, base: 15, lg: 18, xl: 20, '2xl': 24, '3xl': 32 },

    families: {
      display: { family: 'Plus Jakarta Sans', weights: [600, 700, 800], role: 'Headings, hero, CTAs' },
      body:    { family: 'Inter',             weights: [400, 500, 600], role: 'Body, UI, forms' },
      mono:    { family: 'JetBrains Mono',    weights: [400, 500],      role: 'Code, YAML, technical data' },
    },

    scale: {
      display:      { size: '40px', line: '48px', weight: 800, use: 'Hero' },
      'heading-lg': { size: '32px', line: '40px', weight: 700, use: 'Page titles' },
      'heading-md': { size: '24px', line: '32px', weight: 700, use: 'Section titles' },
      'heading-sm': { size: '20px', line: '28px', weight: 600, use: 'Card titles, KPIs' },
      'body-lg':    { size: '18px', line: '28px', weight: 400, use: 'Lead paragraphs' },
      body:         { size: '15px', line: '24px', weight: 400, use: 'Default body' },
      'body-sm':    { size: '14px', line: '20px', weight: 400, use: 'Secondary text' },
      label:        { size: '13px', line: '18px', weight: 500, use: 'Labels, badges' },
      caption:      { size: '12px', line: '16px', weight: 500, use: 'Captions, footnotes' },
      tiny:         { size: '11px', line: '14px', weight: 500, use: 'Status indicators' },
    },
  },

  palette,

  shadows: {
    sm:   '0 1px 2px rgba(0,0,0,0.05)',
    md:   '0 4px 6px -1px rgba(0,0,0,0.1)',
    lg:   '0 10px 15px -3px rgba(0,0,0,0.1)',
    glow: '0 0 20px rgba(45,212,191,0.15)',
  },

  scales: {
    radii:   { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', '2xl': '20px', full: '9999px' },
    padding: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '24px', '3xl': '32px' },
    gap:     { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', '2xl': '32px' },
  },
};

export const aurora = createTheme(config);
export type AuroraTheme = typeof aurora;
