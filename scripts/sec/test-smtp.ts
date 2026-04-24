#!/usr/bin/env -S node --env-file=apps/api/.env.local --import tsx/esm
/**
 * test-smtp.ts — validate Resend SMTP credentials end to end.
 *
 * Step 1: open an SMTP connection + authenticate (no send). Catches
 *          wrong host, wrong port, bad API key, firewalled ports.
 * Step 2: if a recipient arg is provided, actually send a test message.
 *
 * Usage:
 *   node --env-file=apps/api/.env.local --import tsx/esm scripts/sec/test-smtp.ts
 *   node --env-file=apps/api/.env.local --import tsx/esm scripts/sec/test-smtp.ts your@inbox.com
 */

import nodemailer from 'nodemailer';

async function main() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  console.log('Loaded config:');
  console.log(`  SMTP_HOST=${host ?? '(missing)'}`);
  console.log(`  SMTP_PORT=${port ?? '(missing)'}`);
  console.log(`  SMTP_USER=${user ?? '(missing)'}`);
  console.log(`  SMTP_PASS=${pass ? '(set, ' + pass.length + ' chars)' : '(MISSING)'}`);
  console.log(`  SMTP_FROM=${from ?? '(missing)'}`);
  console.log('');

  if (!host || !port || !user || !pass || !from) {
    console.error('✗ one or more SMTP_* env vars are missing. Check apps/api/.env.local');
    process.exit(2);
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    auth: { user, pass },
  });

  console.log('Step 1 · Verifying SMTP connection + auth…');
  try {
    await transporter.verify();
    console.log('✓ Connection + auth OK');
  } catch (err) {
    console.error('✗ Connection failed:', (err as Error).message);
    process.exit(3);
  }

  const to = process.argv[2];
  if (!to) {
    console.log('');
    console.log('Done. To send a test email, re-run with a recipient:');
    console.log(
      '  node --env-file=apps/api/.env.local --import tsx/esm scripts/sec/test-smtp.ts your@inbox.com',
    );
    return;
  }

  console.log(`\nStep 2 · Sending test email to ${to}…`);
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'BrightTale SMTP test',
      text: 'If you see this, Resend SMTP is wired correctly. Reply with 🎉.',
      html:
        '<p>If you see this, <b>Resend SMTP</b> is wired correctly.</p>' +
        '<p>Reply with 🎉.</p>',
    });
    console.log(`✓ Sent · messageId=${info.messageId}`);
    console.log(`  Response: ${info.response}`);
    console.log(`  Accepted: ${info.accepted.join(', ')}`);
    if (info.rejected?.length) console.log(`  Rejected: ${info.rejected.join(', ')}`);
    console.log('');
    console.log('Now check:');
    console.log('  1. Your inbox (and spam folder) — email should arrive in <30 s');
    console.log('  2. Resend dashboard → Emails → the send shows as "delivered"');
  } catch (err) {
    console.error('✗ Send failed:', (err as Error).message);
    process.exit(4);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
