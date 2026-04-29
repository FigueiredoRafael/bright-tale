#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../apps/api/src/lib/crypto.js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const channelId = process.argv[2];
const userId = process.argv[3];
if (!channelId || !userId) {
  console.error("Usage: wp-user-check.ts <channelId> <userId>");
  process.exit(1);
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb
    .from("wordpress_configs")
    .select("site_url, username, password")
    .eq("channel_id", channelId)
    .maybeSingle();
  const auth = Buffer.from(`${data!.username}:${decrypt(data!.password as string)}`).toString("base64");

  for (const ctx of ["", "?context=edit"]) {
    const url = `${data!.site_url}/wp-json/wp/v2/users/${userId}${ctx}`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    console.log(`GET ${url}`);
    console.log(`  status: ${res.status}`);
    const body = await res.text();
    console.log(`  body: ${body.slice(0, 200)}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
