#!/usr/bin/env npx tsx
/**
 * Inspect a WP user's roles + capabilities (context=edit).
 *
 * cd apps/api && npx tsx ../../scripts/wp-author-roles.ts \
 *   --project bef8f1d6-... --user-id 9
 */

import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../apps/api/src/lib/crypto.js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

function arg(name: string, fallback = ""): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const projectId = arg("project");
const userId = arg("user-id");
if (!projectId || !userId) {
  console.error("Missing --project or --user-id");
  process.exit(1);
}

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sUrl || !sKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(sUrl, sKey);

async function main() {
  const { data: project } = await sb
    .from("projects").select("channel_id").eq("id", projectId).maybeSingle();
  if (!project?.channel_id) throw new Error("Project/channel missing");

  const { data: wpCfg } = await sb
    .from("wordpress_configs")
    .select("site_url, username, password")
    .eq("channel_id", project.channel_id as string)
    .maybeSingle();
  if (!wpCfg) throw new Error("No WP config");

  const wpUser = wpCfg.username as string;
  const wpSecret = decrypt(wpCfg.password as string);
  const siteUrl = (wpCfg.site_url as string).replace(/\/$/, "");
  const basicAuth = Buffer.from(`${wpUser}:${wpSecret}`).toString("base64");

  console.log(`\n=== WP User ${userId} — full edit context ===\n`);

  const res = await fetch(`${siteUrl}/wp-json/wp/v2/users/${userId}?context=edit`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  console.log("status:", res.status);
  const body = await res.json() as Record<string, unknown>;
  console.log("name:", body.name);
  console.log("slug:", body.slug);
  console.log("email:", body.email);
  console.log("roles:", body.roles);
  console.log("capabilities (truthy only):");
  const caps = (body.capabilities ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(caps)) {
    if (v) console.log(`  ${k}`);
  }
  console.log();

  console.log("Trying POST /posts with author=" + userId + " (status=draft, dry-run-ish) ...");
  const dryRes = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "[probe] author capability test — delete me",
      content: "probe",
      status: "draft",
      author: Number(userId),
    }),
  });
  console.log("POST status:", dryRes.status);
  const dryBody = await dryRes.json() as Record<string, unknown>;
  if (dryRes.ok) {
    console.log("→ accepted, post id:", dryBody.id, "(remember to delete it)");
  } else {
    console.log("→ rejected:", JSON.stringify(dryBody).slice(0, 500));
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
