/**
 * M-009 — Lifecycle jobs unit tests
 *
 * Category B: no DB required — Supabase and email are fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/jobs/client.js', () => ({
  inngest: {
    createFunction: (cfg: unknown, handler: unknown) => ({ handler, cfg }),
  },
}));

const mockSendEmail = vi.fn();
vi.mock('@/lib/email/provider.js', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

// Supabase chain mock
const maybeSingleMock = vi.fn();
const singleMock = vi.fn();
const insertMock = vi.fn();
const supabaseChain = {
  select: vi.fn(() => supabaseChain),
  eq: vi.fn(() => supabaseChain),
  order: vi.fn(() => supabaseChain),
  limit: vi.fn(() => supabaseChain),
  neq: vi.fn(() => supabaseChain),
  maybeSingle: maybeSingleMock,
  single: singleMock,
  insert: insertMock,
};
const fromMock = vi.fn(() => supabaseChain);

vi.mock('@/lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({ from: fromMock })),
}));

import * as Sentry from '@sentry/node';
import {
  lifecycleWelcomeEmail,
  lifecycleCheckin7d,
  lifecycleChurnCheck,
  lifecycleNpsSurvey,
} from '@/jobs/lifecycle.js';

// ── Type helpers ──────────────────────────────────────────────────────────────

interface JobShape<TEvent> {
  handler: (ctx: {
    event: TEvent;
    step: {
      run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
      sendEvent: (name: string, event: Record<string, unknown>) => Promise<unknown>;
      sleepUntil: (name: string, date: Date | string) => Promise<void>;
    };
  }) => Promise<Record<string, unknown>>;
  cfg: { id: string; retries: number; triggers: Array<{ event?: string; cron?: string }> };
}

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn().mockResolvedValue(undefined),
    sleepUntil: vi.fn().mockResolvedValue(undefined),
  };
}

// ── welcome-email ─────────────────────────────────────────────────────────────

describe('lifecycle/welcome-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct inngest config', () => {
    const job = lifecycleWelcomeEmail as unknown as JobShape<unknown>;
    expect(job.cfg.id).toBe('lifecycle-welcome-email');
    expect(job.cfg.retries).toBe(3);
    expect(job.cfg.triggers).toEqual([{ event: 'lifecycle/welcome-email' }]);
  });

  it('sends welcome email and records event then enqueues check-in + NPS', async () => {
    maybeSingleMock.mockResolvedValue({ data: { email: 'user@test.com' } });
    insertMock.mockResolvedValue({ error: null });
    mockSendEmail.mockResolvedValue({ id: 'mock-id', provider: 'resend' });

    const step = makeStep();
    const job = lifecycleWelcomeEmail as unknown as JobShape<{
      name: 'lifecycle/welcome-email';
      data: { userId: string; orgId: string; planId: string };
    }>;

    const result = await job.handler({
      event: { name: 'lifecycle/welcome-email', data: { userId: 'u1', orgId: 'o1', planId: 'creator' } },
      step,
    });

    // welcome email step + record event step + sendEvent (check-in) + sendEvent (NPS)
    expect(step.run).toHaveBeenCalledWith('send-welcome-email', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('record-welcome-event', expect.any(Function));
    expect(step.sendEvent).toHaveBeenCalledWith('enqueue-checkin-7d', expect.objectContaining({
      name: 'lifecycle/checkin-7d',
      data: { userId: 'u1', orgId: 'o1' },
    }));
    expect(step.sendEvent).toHaveBeenCalledWith('enqueue-nps-survey', expect.objectContaining({
      name: 'lifecycle/nps-survey',
      data: { userId: 'u1', orgId: 'o1' },
    }));
    expect(result.status).toBe('welcome_sent');
  });

  it('skips email send when user email not found', async () => {
    maybeSingleMock.mockResolvedValue({ data: null });
    insertMock.mockResolvedValue({ error: null });

    const step = makeStep();
    const job = lifecycleWelcomeEmail as unknown as JobShape<{
      name: 'lifecycle/welcome-email';
      data: { userId: string; orgId: string; planId: string };
    }>;

    await job.handler({
      event: { name: 'lifecycle/welcome-email', data: { userId: 'u2', orgId: 'o2', planId: 'starter' } },
      step,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('captures to Sentry and re-throws on error', async () => {
    const boom = new Error('db error');
    const step = makeStep();
    step.run.mockRejectedValueOnce(boom);

    const job = lifecycleWelcomeEmail as unknown as JobShape<{
      name: 'lifecycle/welcome-email';
      data: { userId: string; orgId: string; planId: string };
    }>;

    await expect(
      job.handler({
        event: { name: 'lifecycle/welcome-email', data: { userId: 'u3', orgId: 'o3', planId: 'pro' } },
        step,
      }),
    ).rejects.toThrow('db error');

    expect(Sentry.captureException).toHaveBeenCalledWith(boom, expect.objectContaining({
      tags: { job: 'lifecycle-welcome-email' },
    }));
  });
});

// ── checkin-7d ────────────────────────────────────────────────────────────────

describe('lifecycle/checkin-7d', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct inngest config', () => {
    const job = lifecycleCheckin7d as unknown as JobShape<unknown>;
    expect(job.cfg.id).toBe('lifecycle-checkin-7d');
    expect(job.cfg.retries).toBe(3);
  });

  it('does not send nudge email when user is engaged (credits_used > 0)', async () => {
    // First step.run call returns credits_used, others go through normally
    const step = makeStep();
    step.run.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
      if (name === 'check-credits-used') return 10; // engaged
      return fn();
    });
    maybeSingleMock.mockResolvedValue({ data: { email: 'user@test.com' } });
    insertMock.mockResolvedValue({ error: null });

    const job = lifecycleCheckin7d as unknown as JobShape<{
      name: 'lifecycle/checkin-7d';
      data: { userId: string; orgId: string };
    }>;

    const result = await job.handler({
      event: { name: 'lifecycle/checkin-7d', data: { userId: 'u1', orgId: 'o1' } },
      step,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result.engaged).toBe(true);
  });

  it('sends nudge email when user is NOT engaged (credits_used === 0)', async () => {
    const step = makeStep();
    step.run.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
      if (name === 'check-credits-used') return 0; // not engaged
      return fn();
    });
    maybeSingleMock.mockResolvedValue({ data: { email: 'user@test.com' } });
    insertMock.mockResolvedValue({ error: null });
    mockSendEmail.mockResolvedValue({ id: 'mock-id', provider: 'resend' });

    const job = lifecycleCheckin7d as unknown as JobShape<{
      name: 'lifecycle/checkin-7d';
      data: { userId: string; orgId: string };
    }>;

    const result = await job.handler({
      event: { name: 'lifecycle/checkin-7d', data: { userId: 'u1', orgId: 'o1' } },
      step,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(result.engaged).toBe(false);
  });

  it('enqueues churn-check 7d after check-in', async () => {
    const step = makeStep();
    step.run.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
      if (name === 'check-credits-used') return 5;
      return fn();
    });
    insertMock.mockResolvedValue({ error: null });

    const job = lifecycleCheckin7d as unknown as JobShape<{
      name: 'lifecycle/checkin-7d';
      data: { userId: string; orgId: string };
    }>;

    await job.handler({
      event: { name: 'lifecycle/checkin-7d', data: { userId: 'u1', orgId: 'o1' } },
      step,
    });

    expect(step.sendEvent).toHaveBeenCalledWith('enqueue-churn-check', expect.objectContaining({
      name: 'lifecycle/churn-check',
      data: { userId: 'u1', orgId: 'o1' },
    }));
  });
});

// ── churn-check ───────────────────────────────────────────────────────────────

describe('lifecycle/churn-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct inngest config', () => {
    const job = lifecycleChurnCheck as unknown as JobShape<unknown>;
    expect(job.cfg.id).toBe('lifecycle-churn-check');
    expect(job.cfg.retries).toBe(3);
  });

  it('sends churn-prevention email + notification when at_risk (credits_used === 0)', async () => {
    const step = makeStep();
    step.run.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
      if (name === 'check-credits-used') return 0;
      return fn();
    });
    maybeSingleMock.mockResolvedValue({ data: { email: 'u@test.com' } });
    insertMock.mockResolvedValue({ error: null });
    mockSendEmail.mockResolvedValue({ id: 'x', provider: 'resend' });

    const job = lifecycleChurnCheck as unknown as JobShape<{
      name: 'lifecycle/churn-check';
      data: { userId: string; orgId: string };
    }>;

    const result = await job.handler({
      event: { name: 'lifecycle/churn-check', data: { userId: 'u1', orgId: 'o1' } },
      step,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(result.atRisk).toBe(true);
    expect(result.status).toBe('churn_check_done');
  });

  it('skips email and notification when user is active', async () => {
    const step = makeStep();
    step.run.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
      if (name === 'check-credits-used') return 50;
      return fn();
    });
    insertMock.mockResolvedValue({ error: null });

    const job = lifecycleChurnCheck as unknown as JobShape<{
      name: 'lifecycle/churn-check';
      data: { userId: string; orgId: string };
    }>;

    const result = await job.handler({
      event: { name: 'lifecycle/churn-check', data: { userId: 'u1', orgId: 'o1' } },
      step,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result.atRisk).toBe(false);
  });
});

// ── nps-survey ────────────────────────────────────────────────────────────────

describe('lifecycle/nps-survey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct inngest config', () => {
    const job = lifecycleNpsSurvey as unknown as JobShape<unknown>;
    expect(job.cfg.id).toBe('lifecycle-nps-survey');
    expect(job.cfg.retries).toBe(3);
  });

  it('sends NPS email and records event', async () => {
    maybeSingleMock.mockResolvedValue({ data: { email: 'u@test.com' } });
    insertMock.mockResolvedValue({ error: null });
    mockSendEmail.mockResolvedValue({ id: 'nps-id', provider: 'resend' });

    const step = makeStep();
    const job = lifecycleNpsSurvey as unknown as JobShape<{
      name: 'lifecycle/nps-survey';
      data: { userId: string; orgId: string };
    }>;

    const result = await job.handler({
      event: { name: 'lifecycle/nps-survey', data: { userId: 'u1', orgId: 'o1' } },
      step,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('nps_sent');
  });

  it('skips email when user email is not found', async () => {
    maybeSingleMock.mockResolvedValue({ data: null });
    insertMock.mockResolvedValue({ error: null });

    const step = makeStep();
    const job = lifecycleNpsSurvey as unknown as JobShape<{
      name: 'lifecycle/nps-survey';
      data: { userId: string; orgId: string };
    }>;

    await job.handler({
      event: { name: 'lifecycle/nps-survey', data: { userId: 'u1', orgId: 'o1' } },
      step,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('captures to Sentry and re-throws on error', async () => {
    const boom = new Error('nps boom');
    const step = makeStep();
    step.run.mockRejectedValueOnce(boom);

    const job = lifecycleNpsSurvey as unknown as JobShape<{
      name: 'lifecycle/nps-survey';
      data: { userId: string; orgId: string };
    }>;

    await expect(
      job.handler({
        event: { name: 'lifecycle/nps-survey', data: { userId: 'u1', orgId: 'o1' } },
        step,
      }),
    ).rejects.toThrow('nps boom');

    expect(Sentry.captureException).toHaveBeenCalledWith(boom, expect.objectContaining({
      tags: { job: 'lifecycle-nps-survey' },
    }));
  });
});
