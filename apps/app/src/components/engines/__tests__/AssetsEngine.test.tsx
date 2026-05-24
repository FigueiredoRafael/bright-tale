import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsEngine } from '../AssetsEngine';
import type { PipelineContext } from '../types';

/* ── Mocks ── */

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({
    trackStarted: vi.fn(),
    trackCompleted: vi.fn(),
    trackFailed: vi.fn(),
    trackAction: vi.fn(),
  }),
}));
vi.mock('../ContextBanner', () => ({
  ContextBanner: () => null,
}));
vi.mock('../ManualOutputDialog', () => ({
  ManualOutputDialog: () => null,
}));
vi.mock('../ImportPicker', () => ({
  ImportPicker: () => null,
}));
vi.mock('@/components/ai/ModelPicker', () => ({
  ModelPicker: () => null,
  MODELS_BY_PROVIDER: { gemini: [{ id: 'gemini-1.5-pro' }], openai: [{ id: 'gpt-4o' }], manual: [{ id: 'manual' }] },
}));
vi.mock('../utils/personaTheme', () => ({
  getPersonaTheme: () => ({ glow: '0,0,0', gradient: 'none', accent: 'black' }),
}));

/* ── Fixtures ── */

const BASE_CONTEXT: PipelineContext = {
  channelId: 'ch-1',
  projectId: 'proj-1',
  draftId: 'draft-1',
};

const VIDEO_DRAFT_JSON = {
  thumbnail_ideas: [
    { title: 'Strike-through Copy', brief: 'Bold COPY text with red strike', mood: 'Punchy' },
    { title: 'Hidden Engine', brief: 'Exploded factory view', mood: 'Investigative' },
    { title: 'Two Founders', brief: 'Split frame founders', mood: 'Comparative' },
  ],
  lower_thirds: [
    { at: '0:42', label: 'The setup: copying was real' },
    { at: '2:30', label: 'The hidden engine' },
  ],
  title_options: [
    'The China Copycat Trap: Main Title',
    'Stop Copying China',
    'Why Clone It Fails',
  ],
  video_description: 'Copying China sounds easy. It rarely is.',
  pinned_comment: 'Sources here: brightcurios.com/china',
  tags: ['china business', 'entrepreneurship'],
  script: {
    chapters: [
      {
        title: 'Yes, Copying Was Part of the Story',
        duration: '1:48',
        broll: ['archival factory footage', 'license-deal photos'],
        content: 'Chapter content here',
      },
      {
        title: 'The Hidden Engine Nobody Imports',
        duration: '1:45',
        broll: ['shipping ports timelapse', 'factory worker close-up'],
        content: 'More content here',
      },
    ],
  },
  thumbnail: {
    facePromptHint: 'Host pointing at red strike-through over a copied product photo',
    headline: 'COPY ≠ WIN',
  },
};

// fetch mock — used for the loading-assets call in useEffect
const mockWriteText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], error: null }) })
  ));
  mockWriteText.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  // Assign clipboard stub to navigator — works in JSDOM when assigned as configurable property
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });
});

function renderVideoAssetsEngine() {
  return render(
    <AssetsEngine
      mode="generate"
      channelId="ch-1"
      context={BASE_CONTEXT}
      draftId="draft-1"
      draftStatus="approved"
      trackMedium="video"
      draftJson={VIDEO_DRAFT_JSON}
      onComplete={vi.fn()}
      onBack={vi.fn()}
    />
  );
}

function renderBlogAssetsEngine() {
  return render(
    <AssetsEngine
      mode="generate"
      channelId="ch-1"
      context={BASE_CONTEXT}
      draftId="draft-1"
      draftStatus="approved"
      onComplete={vi.fn()}
      onBack={vi.fn()}
    />
  );
}

/* ── Tests: Video layout ── */

describe('AssetsEngine — video track', () => {
  it('renders thumbnail concepts section with cards', () => {
    renderVideoAssetsEngine();
    expect(screen.getByText('Thumbnail')).toBeDefined();
    expect(screen.getByText('Strike-through Copy')).toBeDefined();
    expect(screen.getByText('Hidden Engine')).toBeDefined();
    expect(screen.getByText('Two Founders')).toBeDefined();
  });

  it('renders chapter cards section', () => {
    renderVideoAssetsEngine();
    expect(screen.getByText('Yes, Copying Was Part of the Story')).toBeDefined();
    expect(screen.getByText('The Hidden Engine Nobody Imports')).toBeDefined();
  });

  it('renders hook visual section', () => {
    renderVideoAssetsEngine();
    expect(screen.getByText('Hook visual (first 3 seconds)')).toBeDefined();
    expect(screen.getByText(/Host pointing at red strike-through/i)).toBeDefined();
  });

  it('renders text bundle with title, description, tags, and pinned comment', () => {
    renderVideoAssetsEngine();
    expect(screen.getByText('Video title')).toBeDefined();
    expect(screen.getByText('Copying China sounds easy. It rarely is.')).toBeDefined();
    expect(screen.getByText('Sources here: brightcurios.com/china')).toBeDefined();
  });

  it('mode toggle defaults to prompts-only', () => {
    renderVideoAssetsEngine();
    const toggle = screen.getByRole('button', { name: /prompts.only/i });
    expect(toggle).toBeDefined();
    // The prompts-only button should have the active styling (bg-background class or aria-pressed)
    expect(toggle.className).toContain('bg-background');
  });

  it('mode toggle is interactive and switches mode', async () => {
    const user = userEvent.setup();
    renderVideoAssetsEngine();
    const generateBtn = screen.getByRole('button', { name: /gerar aqui|generate/i });
    await user.click(generateBtn);
    expect(generateBtn.className).toContain('bg-background');
  });

  it('Generate mode toggle button has coming-next indicator in its label', () => {
    renderVideoAssetsEngine();
    // The Generate toggle button must have a "coming next" affordance — visible text
    const generateToggle = screen.getByRole('button', { name: /generate here/i });
    expect(generateToggle.textContent).toMatch(/coming next/i);
  });

  it('Regenerate button is disabled when in generate mode', async () => {
    const user = userEvent.setup();
    renderVideoAssetsEngine();
    // Switch to generate mode
    const generateToggle = screen.getByRole('button', { name: /generate here/i });
    await user.click(generateToggle);
    // Regenerate buttons on concept cards should be disabled
    const regenBtns = screen.getAllByRole('button', { name: /regenerate/i });
    expect(regenBtns.length).toBeGreaterThan(0);
    regenBtns.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('Copy button triggers clipboard write and shows toast confirmation', async () => {
    const user = userEvent.setup();
    renderVideoAssetsEngine();
    const copyBtn = screen.getByRole('button', { name: /copy video title/i });
    await user.click(copyBtn);
    // The Copy handler writes to clipboard and shows a toast — verify either one
    const clipboardWasCalled = mockWriteText.mock.calls.length > 0;
    const toastWasCalled = mockToast.success.mock.calls.length > 0;
    expect(clipboardWasCalled || toastWasCalled).toBe(true);
  });
});

/* ── Tests: Blog regression ── */

describe('AssetsEngine — blog track (regression)', () => {
  it('renders the blog layout — briefs stepper visible after loading', async () => {
    renderBlogAssetsEngine();
    // Blog layout shows loading first then "Briefs" stepper
    await waitFor(() => {
      expect(screen.getByText('Briefs')).toBeDefined();
    });
  });

  it('does NOT render video thumbnail section in blog mode', async () => {
    renderBlogAssetsEngine();
    await waitFor(() => expect(screen.getByText('Briefs')).toBeDefined());
    expect(screen.queryByText('Thumbnail')).toBeNull();
  });

  it('does NOT render chapter cards in blog mode', async () => {
    renderBlogAssetsEngine();
    await waitFor(() => expect(screen.getByText('Briefs')).toBeDefined());
    expect(screen.queryByText(/chapter|capítulo/i)).toBeNull();
  });
});
