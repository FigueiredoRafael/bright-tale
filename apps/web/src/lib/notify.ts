/**
 * M-005 — server-side notify helper.
 * Inserts a notification row; Supabase Realtime pushes it to the client Bell.
 * Email delivery is intentionally NOT wired yet (Resend integration TODO).
 *
 * Template support (M-015 extension):
 * When `title` is omitted, `notify()` fetches the matching row from
 * `notification_templates`, interpolates `variables` into `title_template` /
 * `body_template`, and uses `default_action_url` when no `actionUrl` is given.
 * Passing `title` explicitly skips the template fetch entirely (no extra query).
 */
import { createAdminClient } from '@/lib/supabase/admin';

export type NotificationType =
  | 'donation_received'
  | 'donation_pending_approval'
  | 'tokens_reset'
  | 'plan_low'
  | 'plan_renewed'
  | 'job_done'
  | 'announcement'
  | 'coupon_redeemed'
  | 'security';

export interface NotifyOptions {
  userId: string;
  /** Accepts any string; IDE still suggests the known NotificationType literals. */
  type: NotificationType | (string & Record<never, never>);
  /** When omitted the title is pulled from the notification_templates table. */
  title?: string;
  body?: string;
  actionUrl?: string;
  /** Variable map interpolated into the template (or the explicit title/body). */
  variables?: Record<string, string>;
  /**
   * BCP-47 locale of the recipient (e.g. 'en', 'pt-BR').
   * notify() fetches notification_template_translations for this locale,
   * falling back to the base pt-BR template when no translation exists.
   * Defaults to 'pt-BR' if omitted.
   */
  locale?: string;
  /** How many days until this notification expires. Default: 90 */
  ttlDays?: number;
  /** auth.users.id of the admin/manager who triggered this notification. */
  sentBy?: string;
}

/** Replace {key} placeholders with values from vars. Unknown keys are kept as-is. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

interface NotificationTemplate {
  type: string;
  title_template: string;
  body_template: string | null;
  default_action_url: string | null;
}

interface NotificationTemplateTranslation {
  title_template: string;
  body_template: string | null;
}

async function resolveNotification(
  opts: NotifyOptions,
): Promise<{ title: string; body: string | null; actionUrl: string | null }> {
  const vars = opts.variables ?? {};

  // Fast path: caller provided an explicit title — interpolate vars and return.
  if (opts.title !== undefined) {
    return {
      title: Object.keys(vars).length > 0 ? interpolate(opts.title, vars) : opts.title,
      body: opts.body
        ? Object.keys(vars).length > 0
          ? interpolate(opts.body, vars)
          : opts.body
        : null,
      actionUrl: opts.actionUrl ?? null,
    };
  }

  // Slow path: fetch template from DB, with locale-aware translation lookup.
  const db = createAdminClient();
  const locale = opts.locale ?? 'pt-BR';

  // 1. Try the locale-specific translation first (skip for pt-BR, that IS the base).
  let titleTpl: string | null = null;
  let bodyTpl: string | null = null;

  if (locale !== 'pt-BR') {
    const { data: translation } = await db
      .from('notification_template_translations')
      .select('title_template, body_template')
      .eq('type', opts.type)
      .eq('locale', locale)
      .maybeSingle<NotificationTemplateTranslation>();

    if (translation) {
      titleTpl = translation.title_template;
      bodyTpl = translation.body_template;
    }
  }

  // 2. Fall back to the base pt-BR template.
  if (titleTpl === null) {
    const { data: tpl } = await db
      .from('notification_templates')
      .select('type, title_template, body_template, default_action_url')
      .eq('type', opts.type)
      .maybeSingle<NotificationTemplate>();

    if (!tpl) {
      return {
        title: opts.type,
        body: opts.body ?? null,
        actionUrl: opts.actionUrl ?? null,
      };
    }

    titleTpl = tpl.title_template;
    bodyTpl = tpl.body_template;

    return {
      title: interpolate(titleTpl, vars),
      body: bodyTpl ? interpolate(bodyTpl, vars) : (opts.body ?? null),
      actionUrl: opts.actionUrl ?? tpl.default_action_url ?? null,
    };
  }

  return {
    title: interpolate(titleTpl, vars),
    body: bodyTpl ? interpolate(bodyTpl, vars) : (opts.body ?? null),
    actionUrl: opts.actionUrl ?? null,
  };
}

export async function notify(opts: NotifyOptions): Promise<void> {
  const db = createAdminClient();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (opts.ttlDays ?? 90));

  // Auto-detect user's locale from user_profiles when not provided.
  let locale = opts.locale;
  if (!locale && opts.title === undefined) {
    const { data: profile } = await db
      .from('user_profiles')
      .select('locale')
      .eq('id', opts.userId)
      .maybeSingle<{ locale: string }>();
    locale = profile?.locale ?? 'pt-BR';
  }

  const { title, body, actionUrl } = await resolveNotification({ ...opts, locale });

  await db.from('notifications').insert({
    user_id: opts.userId,
    type: opts.type,
    title,
    body,
    action_url: actionUrl,
    expires_at: expiresAt.toISOString(),
    sent_via_email: false,
    sent_via_push: false,
    sent_by: opts.sentBy ?? null,
  });
}

/** Notify multiple users at once (broadcast to a subset). */
export async function notifyMany(
  userIds: string[],
  opts: Omit<NotifyOptions, 'userId'>,
): Promise<void> {
  if (userIds.length === 0) return;
  const db = createAdminClient();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (opts.ttlDays ?? 90));

  const { title, body, actionUrl } = await resolveNotification({ ...opts, userId: '' });

  await db.from('notifications').insert(
    userIds.map((userId) => ({
      user_id: userId,
      type: opts.type,
      title,
      body,
      action_url: actionUrl,
      expires_at: expiresAt.toISOString(),
      sent_via_email: false,
      sent_via_push: false,
      sent_by: opts.sentBy ?? null,
    })),
  );
}
