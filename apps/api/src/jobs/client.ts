/**
 * Inngest client (F2-014)
 *
 * Shared Inngest client used by all job functions.
 * In development, runs with Inngest Dev Server.
 * In production, connects to Inngest Cloud.
 */

import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'brighttale-api',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
