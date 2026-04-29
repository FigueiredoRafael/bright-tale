#!/usr/bin/env npx tsx
/**
 * Probe a draft's persona ↔ WP author linkage.
 *
 * Run from apps/api so SUPABASE_* + ENCRYPTION_KEY load from .env.local:
 *   cd apps/api && npx tsx ../../scripts/wp-author-probe.ts \
 *     --project bef8f1d6-... --persona ff466d69-... --check-id 9
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
const personaId = arg("persona");
const checkId = arg("check-id");

if (!projectId || !personaId) {
  console.error("Missing --project or --persona");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

async function wpGetUser(siteUrl: string, basicAuth: string, id: string | number) {
  const url = `${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/users/${id}?context=edit`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function wpListUsers(siteUrl: string, basicAuth: string) {
  const url = `${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/users?per_page=100&context=edit`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } });
  const body = await res.json();
  return {
    status: res.status,
    users: body as Array<{ id: number; name: string; slug: string; email?: string }>,
  };
}

async function main() {
  console.log("\n=== WP Author Linkage Probe ===\n");

  const { data: project, error: projErr } = await sb
    .from("projects")
    .select("id, channel_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr) throw projErr;
  if (!project) {
    console.error("Project not found");
    process.exit(1);
  }
  console.log("project.channel_id:", project.channel_id);

  const { data: persona, error: personaErr } = await sb
    .from("personas")
    .select("id, name, slug, wp_author_id")
    .eq("id", personaId)
    .maybeSingle();
  if (personaErr) throw personaErr;
  if (!persona) {
    console.error("Persona not found");
    process.exit(1);
  }
  console.log("persona.name:", persona.name);
  console.log("persona.slug:", persona.slug);
  console.log("persona.wp_author_id (DB):", persona.wp_author_id);

  const { data: wpCfg, error: wpErr } = await sb
    .from("wordpress_configs")
    .select("site_url, username, password")
    .eq("channel_id", project.channel_id as string)
    .maybeSingle();
  if (wpErr) throw wpErr;
  if (!wpCfg) {
    console.error("No WP config for channel");
    process.exit(1);
  }
  const wpUser = wpCfg.username as string;
  const wpSecret = decrypt(wpCfg.password as string);
  const siteUrl = wpCfg.site_url as string;
  const basicAuth = Buffer.from(`${wpUser}:${wpSecret}`).toString("base64");
  console.log("wp.site_url:", siteUrl);
  console.log("wp.username:", wpUser);
  console.log();

  if (persona.wp_author_id != null) {
    console.log(`─── GET /users/${persona.wp_author_id} (from persona.wp_author_id) ───`);
    const r = await wpGetUser(siteUrl, basicAuth, persona.wp_author_id as number);
    console.log("status:", r.status);
    if (r.status === 200) {
      const u = r.body as { id?: number; name?: string; slug?: string };
      console.log("→ FOUND:", { id: u.id, name: u.name, slug: u.slug });
    } else {
      console.log("→ MISSING. response:", JSON.stringify(r.body).slice(0, 200));
    }
    console.log();
  } else {
    console.log("persona.wp_author_id is NULL — would publish under connecting user.\n");
  }

  if (checkId) {
    console.log(`─── GET /users/${checkId} (from --check-id) ───`);
    const r = await wpGetUser(siteUrl, basicAuth, checkId);
    console.log("status:", r.status);
    if (r.status === 200) {
      const u = r.body as { id?: number; name?: string; slug?: string };
      console.log("→ FOUND:", { id: u.id, name: u.name, slug: u.slug });
    } else {
      console.log("→ MISSING. response:", JSON.stringify(r.body).slice(0, 200));
    }
    console.log();
  }

  console.log("─── GET /users (list, first 100) ───");
  const list = await wpListUsers(siteUrl, basicAuth);
  console.log("status:", list.status);
  if (list.status === 200 && Array.isArray(list.users)) {
    for (const u of list.users) {
      const marker =
        u.id === (persona.wp_author_id as number | null) ? " ← persona.wp_author_id" :
        u.id === Number(checkId) ? " ← --check-id" :
        "";
      console.log(
        `  id=${u.id.toString().padStart(3)}  slug=${u.slug.padEnd(20)} name="${u.name}"${marker}`,
      );
    }
  } else {
    console.log("response:", JSON.stringify(list.users).slice(0, 200));
  }
  console.log();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
