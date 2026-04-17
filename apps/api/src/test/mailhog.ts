// Helpers for integration tests. NOT to be imported by unit tests.
import net from 'node:net';

const host = process.env.MAILHOG_HOST ?? 'localhost';
const smtpPort = parseInt(process.env.MAILHOG_SMTP_PORT ?? '1025', 10);
const apiPort = parseInt(process.env.MAILHOG_API_PORT ?? '8025', 10);

const LOCAL_HOSTS = ['localhost', '127.0.0.1', 'host.docker.internal'];

export async function preflightMailhog(): Promise<boolean> {
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to run integration tests against non-local SMTP (MAILHOG_HOST=${host}). ` +
        `Unset MAILHOG_HOST or point to localhost:1025.`,
    );
  }
  return new Promise<boolean>((resolve) => {
    const sock = net.createConnection({ host, port: smtpPort, timeout: 2000 });
    sock.once('connect', () => { sock.end(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
  });
}

export interface MailhogMessage {
  ID: string;
  From: { Mailbox: string; Domain: string };
  To: Array<{ Mailbox: string; Domain: string }>;
  Content: { Headers: Record<string, string[]>; Body: string };
}

export async function getMailhogMessages(): Promise<MailhogMessage[]> {
  const res = await fetch(`http://${host}:${apiPort}/api/v2/messages`);
  if (!res.ok) throw new Error(`MailHog API ${res.status}`);
  const json = (await res.json()) as { items: MailhogMessage[] };
  return json.items;
}

export async function clearMailhog(): Promise<void> {
  const res = await fetch(`http://${host}:${apiPort}/api/v1/messages`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`MailHog clear ${res.status}`);
}

/**
 * Poll MailHog API until at least `minCount` messages appear, or timeout.
 * More robust than a fixed setTimeout: handles slow CI machines without
 * flake and returns fast when MailHog ingests quickly.
 */
export async function pollForMessages(minCount: number, timeoutMs = 5000): Promise<MailhogMessage[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgs = await getMailhogMessages();
    if (msgs.length >= minCount) return msgs;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`pollForMessages timed out waiting for ${minCount} message(s)`);
}
