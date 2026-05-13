import { test, expect } from '@playwright/test';
import {
  DEFAULT_V2_PROJECT,
  mockPipelineV2,
  type PipelineV2Mock,
} from './fixtures/pipelineV2Mocks';

/**
 * v2 supervised pipeline e2e — exercises the new `<PipelineView />` rendered
 * behind `?v=2`. Asserts the four StageView states (form / activity /
 * awaiting / terminal) and the new "View output" sheet that resolves the
 * Payload Ref into the right canonical viewer.
 *
 * The legacy auto-pilot.spec.ts hits xstate-driven Engines on the same page
 * without `?v=2` — both code paths still ship, so both have e2e coverage.
 */

const PROJECT_URL = `/en/projects/${DEFAULT_V2_PROJECT.id}?v=2`;

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser:error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
});

async function openStage(page: import('@playwright/test').Page, stage: string) {
  await page.goto(`${PROJECT_URL}&stage=${stage}`);
  await expect(page.getByTestId(`stage-view-${stage}`)).toBeVisible();
}

test.describe('v2 supervised — four-state StageView', () => {
  test('state 1 (no Stage Run): brainstorm form is the entry point', async ({ page }) => {
    await mockPipelineV2(page);
    await openStage(page, 'brainstorm');

    await expect(page.getByTestId('stage-form-header')).toContainText(/Run Brainstorm/i);
    await expect(page.getByTestId('brainstorm-form')).toBeVisible();
  });

  test('state 1 (non-brainstorm): per-stage placeholder header', async ({ page }) => {
    await mockPipelineV2(page);
    await openStage(page, 'research');

    await expect(page.getByTestId('stage-form-header')).toContainText(/Run Research/i);
    await expect(page.getByTestId('stage-form-placeholder')).toBeVisible();
  });

  test('state 2 (running): activity panel + Abort button', async ({ page }) => {
    const mock = await mockPipelineV2(page);
    mock.setStageRun('brainstorm', { status: 'running', started_at: new Date().toISOString() });

    await openStage(page, 'brainstorm');
    await expect(page.getByTestId('activity-panel')).toBeVisible();
    await expect(page.getByTestId('stage-abort')).toBeVisible();
  });

  test('state 3 (awaiting_user manual_advance): Continue → POST /continue', async ({ page }) => {
    const mock = await mockPipelineV2(page);
    mock.setStageRun('brainstorm', {
      status: 'awaiting_user',
      awaiting_reason: 'manual_advance',
    });

    await openStage(page, 'brainstorm');
    await expect(page.getByTestId('manual-advance-panel')).toBeVisible();

    await page.getByTestId('stage-continue').click();
    await expect.poll(() => mock.actions.some((a) => a.method === 'POST' && a.url.endsWith('/continue'))).toBe(true);
  });

  test('state 4 (completed): terminal panel + "View output" button surfaces', async ({ page }) => {
    const mock = await mockPipelineV2(page);
    mock.completeStageRun('brainstorm', { kind: 'brainstorm_draft', id: 'bd-1' });
    mock.payloads.set('brainstorm_draft#bd-1', {
      kind: 'brainstorm_draft',
      ideas: [
        { id: 'bd-1', title: 'Why deep-sea creatures glow', isWinner: true },
        { id: 'bd-2', title: 'Alternative angle', isWinner: false },
      ],
      engineUrl: null,
    });

    await openStage(page, 'brainstorm');
    await expect(page.getByTestId('terminal-panel')).toBeVisible();
    await expect(page.getByTestId('stage-view-output')).toBeVisible();
  });
});

test.describe('v2 supervised — Stage Run output sheet', () => {
  test('content_draft: clicking View output opens the sheet with markdown body', async ({ page }) => {
    const mock = await mockPipelineV2(page);
    mock.completeStageRun('draft', { kind: 'content_draft', id: 'd-1' });
    // Predecessors completed so StageView doesn't gate the draft view
    seedUpstream(mock);
    mock.payloads.set('content_draft#d-1', {
      kind: 'content_draft',
      title: 'The mystery of bioluminescence',
      type: 'blog',
    });
    mock.drafts.set('d-1', {
      id: 'd-1',
      type: 'blog',
      title: 'The mystery of bioluminescence',
      draft_json: { full_draft: '## Hook\n\n76% of marine species live below 200m, and many emit their own light.' },
    });

    await openStage(page, 'draft');
    await page.getByTestId('stage-view-output').click();

    const sheet = page.getByTestId('stage-output-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('stage-output-draft')).toBeVisible();
    await expect(sheet.getByText('The mystery of bioluminescence')).toBeVisible();
    await expect(sheet.getByText(/below 200m/)).toBeVisible();
  });

  test('research_session: sheet renders the findings report', async ({ page }) => {
    const mock = await mockPipelineV2(page);
    seedUpstream(mock, ['brainstorm']);
    mock.completeStageRun('research', { kind: 'research_session', id: 'rs-1' });
    mock.payloads.set('research_session#rs-1', { kind: 'research_session', cardCount: 5, level: 'medium' });
    mock.researchSessions.set('rs-1', {
      id: 'rs-1',
      cards_json: {
        sources: [
          { title: 'Nature: Bioluminescence in the abyss', url: 'https://nature.com/article/1' },
        ],
        statistics: [],
        expert_quotes: [],
        counterarguments: [],
      },
      approved_cards_json: null,
    });

    await openStage(page, 'research');
    await page.getByTestId('stage-view-output').click();

    const sheet = page.getByTestId('stage-output-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('stage-output-research')).toBeVisible();
  });

  test('brainstorm_draft: sheet renders the full idea set with winner marked', async ({ page }) => {
    const mock = await mockPipelineV2(page);
    mock.completeStageRun('brainstorm', { kind: 'brainstorm_draft', id: 'bd-1' });
    mock.payloads.set('brainstorm_draft#bd-1', {
      kind: 'brainstorm_draft',
      ideas: [
        {
          id: 'bd-1',
          title: 'Why deep-sea creatures glow',
          isWinner: true,
          verdict: 'viable',
          coreTension: 'Survival vs predation',
          targetAudience: 'Curious adults 25-45',
          discoveryData: null,
        },
        {
          id: 'bd-2',
          title: 'Alternative angle: chemistry of light',
          isWinner: false,
          verdict: 'experimental',
          coreTension: null,
          targetAudience: null,
          discoveryData: null,
        },
      ],
      engineUrl: null,
    });

    await openStage(page, 'brainstorm');
    await page.getByTestId('stage-view-output').click();

    const sheet = page.getByTestId('stage-output-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('stage-output-brainstorm')).toBeVisible();
    await expect(sheet.getByText('Why deep-sea creatures glow')).toBeVisible();
    await expect(sheet.getByText(/Alternative angle/)).toBeVisible();
    await expect(sheet.getByTestId('idea-card-winner')).toBeVisible();
  });

  test('unknown payload kind: falls back to raw kind#id (no crash)', async ({ page }) => {
    const mock = await mockPipelineV2(page);
    seedUpstream(mock);
    mock.completeStageRun('draft', { kind: 'mystery_kind', id: 'm-1' });
    mock.payloads.set('mystery_kind#m-1', { kind: 'mystery_kind' });

    await openStage(page, 'draft');
    await page.getByTestId('stage-view-output').click();

    const sheet = page.getByTestId('stage-output-sheet');
    await expect(sheet.getByTestId('stage-output-raw')).toBeVisible();
    await expect(sheet.getByText(/mystery_kind#m-1/)).toBeVisible();
  });
});

test.describe('v2 supervised — abort + re-run', () => {
  test('PATCH abort flips the row + UI re-renders into terminal-aborted', async ({ page }) => {
    const mock = await mockPipelineV2(page);
    mock.setStageRun('brainstorm', { status: 'running', started_at: new Date().toISOString() });

    await openStage(page, 'brainstorm');
    await page.getByTestId('stage-abort').click();

    await expect.poll(
      () => mock.actions.some((a) => a.method === 'PATCH' && (a.body as { action?: string } | null)?.action === 'abort'),
    ).toBe(true);
  });
});

/**
 * Stage Runs are strictly sequential — seed completed upstream rows so the
 * orchestrator's predecessor guard lets the focus Stage render.
 */
function seedUpstream(mock: PipelineV2Mock, stages: Array<'brainstorm' | 'research' | 'draft' | 'review' | 'assets' | 'preview'> = ['brainstorm', 'research']) {
  const payloadKindByStage = {
    brainstorm: 'brainstorm_draft',
    research: 'research_session',
    draft: 'content_draft',
    review: 'content_draft',
    assets: 'asset_set',
    preview: 'preview_payload',
  } as const;
  for (const s of stages) {
    mock.completeStageRun(s, { kind: payloadKindByStage[s], id: `${s}-seed` });
  }
}
