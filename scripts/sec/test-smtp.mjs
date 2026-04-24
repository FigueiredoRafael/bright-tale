#!/usr/bin/env -S node --env-file=apps/api/.env.local
/**
 * test-smtp.mjs — validate SMTP credentials. Pure .mjs avoids the
 * tsx/esm loader cycle we hit with the .ts version.
 *
 * Usage (from repo root):
 *   node --env-file=apps/api/.env.local scripts/sec/test-smtp.mjs
 *   node --env-file=apps/api/.env.local scripts/sec/test-smtp.mjs you@example.com
 */

import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = process.env.SMTP_PORT;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM;

console.log('Loaded config:');
console.log(`  SMTP_HOST=${host ?? '(missing)'}`);
console.log(`  SMTP_PORT=${port ?? '(missing)'}`);
console.log(`  SMTP_USER=${user ?? '(missing)'}`);
console.log(`  SMTP_PASS=${pass ? `(set, ${pass.length} chars)` : '(MISSING)'}`);
console.log(`  SMTP_FROM=${from ?? '(missing)'}`);
console.log('');

if (!host || !port || !user || !pass || !from) {
  console.error('✗ SMTP_* env vars missing. Check apps/api/.env.local');
  process.exit(2);
}

const transporter = nodemailer.createTransport({
  host,
  port: parseInt(port, 10),
  auth: { user, pass },
});

console.log('Step 1 · Verifying connection + auth…');
try {
  await transporter.verify();
  console.log('✓ Connection + auth OK');
} catch (err) {
  console.error('✗ Connection failed:', err.message);
  process.exit(3);
}

const to = process.argv[2];
if (!to) {
  console.log('');
  console.log('Auth works. To send a real test email:');
  console.log('  node --env-file=apps/api/.env.local scripts/sec/test-smtp.mjs you@example.com');
  process.exit(0);
}

console.log(`\nStep 2 · Sending test email to ${to}…`);
try {
  const info = await transporter.sendMail({
    from,
    to,
    subject: 'BrightTale SMTP test',
    text: 'If you see this, Resend SMTP is wired correctly.',
    html: '<p>If you see this, <b>Resend SMTP</b> is wired correctly.</p>',
  });
  console.log(`✓ Sent · messageId=${info.messageId}`);
  console.log(`  Accepted: ${info.accepted.join(', ')}`);
  if (info.rejected?.length) console.log(`  Rejected: ${info.rejected.join(', ')}`);
} catch (err) {
  console.error('✗ Send failed:', err.message);
  process.exit(4);
}
