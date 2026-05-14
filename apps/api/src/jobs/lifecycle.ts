/**
 * M-009 — Post-sale lifecycle jobs (Inngest)
 *
 * Drives the automated email + event lifecycle after a subscription activates:
 *   1. Welcome email   → immediate
 *   2. 7-day check-in  → 7d after welcome
 *   3. Churn check     → 14d after welcome (7d after check-in)
 *   4. NPS survey      → 30d after welcome
 */

import * as Sentry from '@sentry/node';
import { inngest } from './client.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendEmail } from '../lib/email/provider.js';

// ── Event type definitions ────────────────────────────────────────────────────

interface LifecycleWelcomeEvent {
  name: 'lifecycle/welcome-email';
  data: {
    userId: string;
    orgId: string;
    planId: string;
  };
}

interface LifecycleCheckin7dEvent {
  name: 'lifecycle/checkin-7d';
  data: {
    userId: string;
    orgId: string;
  };
}

interface LifecycleChurnCheckEvent {
  name: 'lifecycle/churn-check';
  data: {
    userId: string;
    orgId: string;
  };
}

interface LifecycleNpsSurveyEvent {
  name: 'lifecycle/nps-survey';
  data: {
    userId: string;
    orgId: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const APP_ORIGIN = process.env.APP_ORIGIN ?? 'https://app.brighttale.io';

async function getUserEmail(userId: string): Promise<string | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('user_profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  return (data?.email as string | null) ?? null;
}

async function getCreditsUsed(orgId: string): Promise<number> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('organizations')
    .select('credits_used')
    .eq('id', orgId)
    .single();
  return (data?.credits_used as number | null) ?? 0;
}

async function insertLifecycleEvent(
  userId: string,
  orgId: string,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const sb = createServiceClient();
  // lifecycle_events is not in the generated DB types yet (migration pending).
  // Cast the client to bypass the type check until db:types is re-run.
  const sbAny = sb as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  await sbAny.from('lifecycle_events').insert({
    user_id: userId,
    org_id: orgId,
    event_type: eventType,
    triggered_at: new Date().toISOString(),
    metadata_json: metadata ?? null,
  });
}

// ── 1. Welcome email ──────────────────────────────────────────────────────────

export const lifecycleWelcomeEmail = inngest.createFunction(
  {
    id: 'lifecycle-welcome-email',
    retries: 3,
    triggers: [{ event: 'lifecycle/welcome-email' }],
  },
  async ({
    event,
    step,
  }: {
    event: LifecycleWelcomeEvent;
    step: {
      run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
      sendEvent: (name: string, event: Record<string, unknown>) => Promise<unknown>;
      sleepUntil: (name: string, date: Date | string) => Promise<void>;
    };
  }) => {
    const { userId, orgId, planId } = event.data;

    try {
      // Step 1: Send welcome email
      await step.run('send-welcome-email', async () => {
        const email = await getUserEmail(userId);
        if (!email) return;
        await sendEmail({
          to: email,
          subject: 'Bem-vindo ao BrightTale!',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #2DD4A8;">Seja bem-vindo ao BrightTale!</h2>
              <p>Seu plano <strong>${planId}</strong> está ativo. Você já pode começar a criar conteúdo com IA.</p>
              <p>
                <a href="${APP_ORIGIN}/channels"
                   style="display: inline-block; padding: 12px 24px; background: #2DD4A8; color: white; text-decoration: none; border-radius: 6px;">
                  Começar agora →
                </a>
              </p>
              <p style="color: #666; font-size: 13px;">
                Qualquer dúvida, responda este email — estamos aqui para ajudar.<br/>
                — Equipe BrightTale
              </p>
            </div>
          `,
        });
      });

      // Step 2: Record lifecycle event
      await step.run('record-welcome-event', async () => {
        await insertLifecycleEvent(userId, orgId, 'welcome_sent', { planId });
      });

      // Step 3: Sleep 7 days then trigger check-in
      const checkinAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await step.sleepUntil('sleep-7d', checkinAt);

      await step.sendEvent('enqueue-checkin-7d', {
        name: 'lifecycle/checkin-7d',
        data: { userId, orgId },
      });

      // Also schedule NPS survey 30 days from now (from original trigger time)
      const npsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await step.sleepUntil('sleep-30d-for-nps', npsAt);

      await step.sendEvent('enqueue-nps-survey', {
        name: 'lifecycle/nps-survey',
        data: { userId, orgId },
      });

      return { userId, orgId, status: 'welcome_sent' };
    } catch (err) {
      Sentry.captureException(err, { tags: { job: 'lifecycle-welcome-email' }, extra: { userId, orgId } });
      throw err;
    }
  },
);

// ── 2. 7-day check-in ─────────────────────────────────────────────────────────

export const lifecycleCheckin7d = inngest.createFunction(
  {
    id: 'lifecycle-checkin-7d',
    retries: 3,
    triggers: [{ event: 'lifecycle/checkin-7d' }],
  },
  async ({
    event,
    step,
  }: {
    event: LifecycleCheckin7dEvent;
    step: {
      run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
      sendEvent: (name: string, event: Record<string, unknown>) => Promise<unknown>;
      sleepUntil: (name: string, date: Date | string) => Promise<void>;
    };
  }) => {
    const { userId, orgId } = event.data;

    try {
      const creditsUsed = (await step.run('check-credits-used', async () => {
        return getCreditsUsed(orgId);
      })) as number;

      const engaged = creditsUsed > 0;

      // Send nudge email if not engaged
      await step.run('send-checkin-email', async () => {
        if (engaged) return;
        const email = await getUserEmail(userId);
        if (!email) return;
        await sendEmail({
          to: email,
          subject: 'Já criou seu primeiro conteúdo? 🚀',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #2DD4A8;">Pronto para decolar?</h2>
              <p>Já faz 7 dias desde que você ativou seu plano BrightTale — e queremos ajudar você a criar seu primeiro conteúdo com IA.</p>
              <p>
                <a href="${APP_ORIGIN}/channels"
                   style="display: inline-block; padding: 12px 24px; background: #2DD4A8; color: white; text-decoration: none; border-radius: 6px;">
                  Criar meu primeiro conteúdo →
                </a>
              </p>
              <p style="color: #666; font-size: 13px;">
                Se precisar de ajuda para começar, responda este email e nossa equipe te orienta.<br/>
                — Equipe BrightTale
              </p>
            </div>
          `,
        });
      });

      await step.run('record-checkin-event', async () => {
        await insertLifecycleEvent(userId, orgId, 'checkin_7d', { engaged, creditsUsed });
      });

      // Schedule churn check 7 days later (14d total from signup)
      const churnCheckAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await step.sleepUntil('sleep-7d-for-churn', churnCheckAt);

      await step.sendEvent('enqueue-churn-check', {
        name: 'lifecycle/churn-check',
        data: { userId, orgId },
      });

      return { userId, orgId, engaged, status: 'checkin_7d_done' };
    } catch (err) {
      Sentry.captureException(err, { tags: { job: 'lifecycle-checkin-7d' }, extra: { userId, orgId } });
      throw err;
    }
  },
);

// ── 3. Churn check ────────────────────────────────────────────────────────────

export const lifecycleChurnCheck = inngest.createFunction(
  {
    id: 'lifecycle-churn-check',
    retries: 3,
    triggers: [{ event: 'lifecycle/churn-check' }],
  },
  async ({
    event,
    step,
  }: {
    event: LifecycleChurnCheckEvent;
    step: {
      run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
    };
  }) => {
    const { userId, orgId } = event.data;

    try {
      const creditsUsed = (await step.run('check-credits-used', async () => {
        return getCreditsUsed(orgId);
      })) as number;

      const atRisk = creditsUsed === 0;

      await step.run('send-churn-prevention-email', async () => {
        if (!atRisk) return;
        const email = await getUserEmail(userId);
        if (!email) return;
        await sendEmail({
          to: email,
          subject: 'Não perca seus créditos BrightTale',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #f59e0b;">Seus créditos estão esperando por você</h2>
              <p>Já se passaram 2 semanas e você ainda não usou o BrightTale. Seus créditos continuam lá — prontos para turbinar sua produção de conteúdo.</p>
              <p>
                <a href="${APP_ORIGIN}/channels"
                   style="display: inline-block; padding: 12px 24px; background: #2DD4A8; color: white; text-decoration: none; border-radius: 6px;">
                  Usar meus créditos agora →
                </a>
              </p>
              <p>Se a plataforma não estiver atendendo suas necessidades, <a href="${APP_ORIGIN}/settings/billing">cancele sem custo</a>.</p>
              <p style="color: #666; font-size: 13px;">— Equipe BrightTale</p>
            </div>
          `,
        });
      });

      await step.run('insert-churn-notification', async () => {
        if (!atRisk) return;
        const sb = createServiceClient();
        // Look up a channel for this user to attach the notification to
        const { data: membership } = await sb
          .from('org_memberships')
          .select('org_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!membership) return;

        const { data: channel } = await sb
          .from('channels')
          .select('id')
          .eq('org_id', membership.org_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!channel) return;

        await (
          sb.from('reference_notifications') as unknown as {
            insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
          }
        ).insert({
          channel_id: channel.id,
          org_id: orgId,
          type: 'plan_low',
          title: 'Você ainda não usou o BrightTale',
          message: 'Seus créditos estão esperando. Comece a criar conteúdo para aproveitar ao máximo seu plano.',
        });
      });

      await step.run('record-churn-event', async () => {
        await insertLifecycleEvent(userId, orgId, 'churn_check', { atRisk, creditsUsed });
      });

      return { userId, orgId, atRisk, status: 'churn_check_done' };
    } catch (err) {
      Sentry.captureException(err, { tags: { job: 'lifecycle-churn-check' }, extra: { userId, orgId } });
      throw err;
    }
  },
);

// ── 4. NPS survey ─────────────────────────────────────────────────────────────

export const lifecycleNpsSurvey = inngest.createFunction(
  {
    id: 'lifecycle-nps-survey',
    retries: 3,
    triggers: [{ event: 'lifecycle/nps-survey' }],
  },
  async ({
    event,
    step,
  }: {
    event: LifecycleNpsSurveyEvent;
    step: {
      run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
    };
  }) => {
    const { userId, orgId } = event.data;

    try {
      await step.run('send-nps-email', async () => {
        const email = await getUserEmail(userId);
        if (!email) return;
        // NPS link — points to a simple form or mailto for now
        const npsLink = `mailto:nps@brighttale.io?subject=NPS+BrightTale&body=Nota+de+0+a+10%3A+`;
        await sendEmail({
          to: email,
          subject: 'Como foi sua experiência com o BrightTale?',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #2DD4A8;">Sua opinião importa 💬</h2>
              <p>Já faz 30 dias desde que você começou com o BrightTale. Em uma escala de <strong>0 a 10</strong>, o quanto você recomendaria o BrightTale para um colega criador de conteúdo?</p>
              <p>
                <a href="${npsLink}"
                   style="display: inline-block; padding: 12px 24px; background: #2DD4A8; color: white; text-decoration: none; border-radius: 6px;">
                  Responder pesquisa →
                </a>
              </p>
              <p style="color: #666; font-size: 13px;">Leva menos de 1 minuto. Obrigado! — Equipe BrightTale</p>
            </div>
          `,
        });
      });

      await step.run('record-nps-event', async () => {
        await insertLifecycleEvent(userId, orgId, 'nps_sent');
      });

      return { userId, orgId, status: 'nps_sent' };
    } catch (err) {
      Sentry.captureException(err, { tags: { job: 'lifecycle-nps-survey' }, extra: { userId, orgId } });
      throw err;
    }
  },
);
