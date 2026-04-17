/**
 * PostHog server-side analytics for the API.
 *
 * Tracks key business events (checkout, content generation, publishing).
 * No-ops when POSTHOG_API_KEY is not set.
 *
 * Usage:
 *   import { trackEvent, identifyUser } from '@/lib/posthog';
 *   trackEvent('draft_generated', userId, { channelId, model });
 */
import { PostHog } from 'posthog-node';

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!process.env.POSTHOG_API_KEY) return null;
  if (!_client) {
    _client = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      flushAt: 20,
      flushInterval: 10000,
    });
  }
  return _client;
}

export function trackEvent(
  event: string,
  userId: string,
  properties?: Record<string, unknown>,
): void {
  const client = getClient();
  if (!client) return;
  client.capture({ distinctId: userId, event, properties });
}

export function identifyUser(
  userId: string,
  properties: Record<string, unknown>,
): void {
  const client = getClient();
  if (!client) return;
  client.identify({ distinctId: userId, properties });
}

export async function flushPostHog(): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.shutdown();
  _client = null;
}
