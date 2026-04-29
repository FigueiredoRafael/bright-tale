#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../apps/api/src/lib/crypto.js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const channelId = process.argv[2];
const postId = process.argv[3];
if (!channelId || !postId) {
  console.error("Usage: wp-cleanup-probe.ts <channelId> <postId>");
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
  const res = await fetch(`${data!.site_url}/wp-json/wp/v2/posts/${postId}?force=true`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${auth}` },
  });
  console.log("delete status:", res.status);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
