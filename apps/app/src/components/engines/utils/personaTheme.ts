export interface PersonaTheme {
  accent: string;
  gradient: string;
  glow: string;
}

const THEMES: Record<string, PersonaTheme> = {
  'cole-merritt': {
    accent: '#14b8a6',
    gradient: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)',
    glow: '20, 184, 166',
  },
  'alex-strand': {
    accent: '#f59e0b',
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
    glow: '245, 158, 11',
  },
  'casey-park': {
    accent: '#a855f7',
    gradient: 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)',
    glow: '168, 85, 247',
  },
};

const DEFAULT_THEME: PersonaTheme = {
  accent: '#6366f1',
  gradient: 'linear-gradient(135deg, #818cf8 0%, #4338ca 100%)',
  glow: '99, 102, 241',
};

export function getPersonaTheme(slug?: string | null): PersonaTheme {
  if (slug && THEMES[slug]) return THEMES[slug];
  return DEFAULT_THEME;
}
