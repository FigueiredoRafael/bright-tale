#!/usr/bin/env npx tsx
/**
 * Quick: dump draft fields relevant to WP publish, and probe the existing
 * post (if any) to understand who owns it on WP.
 *
 *   cd apps/api && npx tsx ../../scripts/wp-draft-state.ts --draft <id>
 */

import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../apps/api/src/lib/crypto.js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "";
}

const draftId = arg("draft");
if (!draftId) {
  console.error("Missing --draft");
  process.exit(1);
}

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sUrl || !sKey) {
  console.error("Missing supabase env");
  process.exit(1);
}
const sb = createClient(sUrl, sKey);

async function main() {
  const { data: draft } = await sb
    .from("content_drafts")
    .select("id, project_id, channel_id, persona_id, status, wordpress_post_id, published_url, type")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) {
    console.error("Draft not found");
    process.exit(1);
  }
  console.log("\n=== Draft state ===");
  console.log(draft);

  // Persona
  const { data: persona } = await sb
    .from("personas")
    .select("id, name, slug, wp_author_id")
    .eq("id", draft.persona_id as string)
    .maybeSingle();
  console.log("\n=== Persona ===");
  console.log(persona);

  // WP config
  const { data: wpCfg } = await sb
    .from("wordpress_configs")
    .select("site_url, username, password")
    .eq("channel_id", draft.channel_id as string)
    .maybeSingle();
  if (!wpCfg) {
    console.error("No WP config");
    process.exit(1);
  }
  const wpUser = wpCfg.username as string;
  const wpSecret = decrypt(wpCfg.password as string);
  const siteUrl = (wpCfg.site_url as string).replace(/\/$/, "");
  const basicAuth = Buffer.from(`${wpUser}:${wpSecret}`).toString("base64");

  if (draft.wordpress_post_id) {
    console.log(`\n=== Existing WP post ${draft.wordpress_post_id} ===`);
    const r = await fetch(`${siteUrl}/wp-json/wp/v2/posts/${draft.wordpress_post_id}?context=edit`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    console.log("status:", r.status);
    const b = await r.json() as Record<string, unknown>;
    if (r.ok) {
      console.log("id:", b.id, "author:", b.author, "status:", b.status, "title:", (b.title as { raw?: string })?.raw);
    } else {
      console.log("body:", JSON.stringify(b).slice(0, 400));
    }

    console.log(`\n=== Try PUT /posts/${draft.wordpress_post_id} with author=${persona?.wp_author_id} (probe) ===`);
    const putRes = await fetch(`${siteUrl}/wp-json/wp/v2/posts/${draft.wordpress_post_id}`, {
      method: "PUT",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ author: persona?.wp_author_id }),
    });
    console.log("PUT status:", putRes.status);
    const putBody = await putRes.json() as Record<string, unknown>;
    if (!putRes.ok) {
      console.log("body:", JSON.stringify(putBody).slice(0, 500));
    } else {
      console.log("→ accepted; author now:", putBody.author);
    }
  } else {
    console.log("\nNo existing WP post on this draft (would POST, not PUT).");
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
