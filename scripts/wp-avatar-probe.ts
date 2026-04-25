#!/usr/bin/env npx tsx
/**
 * Probes a WP site to find the correct REST API approach for setting a user avatar.
 *
 * Usage:
 *   WP_SITE=https://yoursite.com WP_USER=admin WP_PASS=xxxx WP_USER_ID=7 npx tsx scripts/wp-avatar-probe.ts
 */

const WP_SITE = (process.env.WP_SITE ?? "").replace(/\/$/, "")
const WP_USER = process.env.WP_USER ?? ""
const WP_PASS = process.env.WP_PASS ?? ""
const WP_USER_ID = process.env.WP_USER_ID ?? "7"

if (!WP_SITE || !WP_USER || !WP_PASS) {
  console.error("Missing env vars: WP_SITE, WP_USER, WP_PASS")
  process.exit(1)
}

const auth = Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64")

async function wpGet(path: string) {
  const res = await fetch(`${WP_SITE}/wp-json${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  })
  const body = await res.json()
  return { status: res.status, body }
}

async function wpPost(path: string, payload: unknown) {
  const res = await fetch(`${WP_SITE}/wp-json${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  return { status: res.status, body }
}

async function main() {
  console.log(`\n=== WP Avatar Probe — ${WP_SITE} — user ${WP_USER_ID} ===\n`)

  // 1. GET user with edit context — shows all REST-readable fields including registered meta
  console.log("─── 1. GET /wp/v2/users/:id?context=edit ───")
  const { status: s1, body: user } = await wpGet(`/wp/v2/users/${WP_USER_ID}?context=edit`)
  console.log("status:", s1)
  console.log("avatar_urls:", JSON.stringify((user as { avatar_urls?: unknown }).avatar_urls, null, 2))
  console.log("meta:", JSON.stringify((user as { meta?: unknown }).meta, null, 2))
  console.log()

  // 2. OPTIONS — returns the full JSON schema including which meta fields are registered
  console.log("─── 2. OPTIONS /wp/v2/users/:id (schema) ───")
  const optRes = await fetch(`${WP_SITE}/wp-json/wp/v2/users/${WP_USER_ID}`, {
    method: "OPTIONS",
    headers: { Authorization: `Basic ${auth}` },
  })
  const schema = (await optRes.json()) as {
    schema?: { properties?: { meta?: { properties?: Record<string, unknown> } } }
  }
  const metaProps = schema.schema?.properties?.meta?.properties ?? {}
  console.log("Writable meta keys:", Object.keys(metaProps).length ? Object.keys(metaProps) : "(none registered)")
  console.log()

  // 3. Find the most recent media attachment, set it as the avatar, and verify it persists
  console.log("─── 3. Set most recent media as avatar — round-trip test ───")
  const { body: media } = await wpGet(`/wp/v2/media?per_page=1&orderby=date&order=desc`)
  const latestId = Array.isArray(media) && media[0] ? (media[0] as { id: number }).id : null
  if (!latestId) {
    console.log("no media found to test with")
  } else {
    console.log("using attachment id:", latestId)
    const { status: sP, body: bP } = await wpPost(`/wp/v2/users/${WP_USER_ID}`, { meta: { wp_user_avatar: latestId } })
    console.log("POST status:", sP)
    if (sP !== 200) console.log("POST error:", JSON.stringify(bP, null, 2))
    const { body: verify } = await wpGet(`/wp/v2/users/${WP_USER_ID}?context=edit`)
    const persisted = (verify as { meta?: { wp_user_avatar?: number } }).meta?.wp_user_avatar
    console.log("verified wp_user_avatar:", persisted, persisted === latestId ? "✓ persisted" : "✗ NOT persisted")
    const avAfter = (verify as { avatar_urls?: Record<string, string> }).avatar_urls
    console.log("avatar_urls AFTER POST:", JSON.stringify(avAfter, null, 2))
    const isGravatar = avAfter && Object.values(avAfter).some(u => u.includes('gravatar') || u.includes('litespeed/avatar'))
    console.log(isGravatar ? "⚠ avatar_urls still Gravatar — plugin isn't reading wp_user_avatar" : "✓ avatar_urls updated to local image")
  }
  console.log()

  // 3b. Try common alternate meta keys used by various avatar plugins
  console.log("─── 3b. Probe alternate avatar meta keys ───")
  const altKeys = ['simple_local_avatar', 'one_user_avatar', '_user_avatar', 'avatar_id', 'user_avatar', 'profile_picture']
  for (const key of altKeys) {
    const optRes = await fetch(`${WP_SITE}/wp-json/wp/v2/users/${WP_USER_ID}`, {
      method: "OPTIONS",
      headers: { Authorization: `Basic ${auth}` },
    })
    const sch = (await optRes.json()) as { schema?: { properties?: { meta?: { properties?: Record<string, unknown> } } } }
    const registered = sch.schema?.properties?.meta?.properties ?? {}
    if (key in registered) console.log(`  ${key}: ✓ registered in REST`)
  }
  console.log()

  // 4. Check available namespaces / routes that mention "avatar"
  console.log('─── 4. Routes mentioning "avatar" ───')
  const { body: routes } = await wpGet("/")
  const allRoutes = Object.keys((routes as { routes?: Record<string, unknown> }).routes ?? {})
  const avatarRoutes = allRoutes.filter(r => r.toLowerCase().includes("avatar"))
  console.log(avatarRoutes.length ? avatarRoutes : "(none found)")
  console.log()

  // 5. Check active plugins (requires admin + /wp/v2/plugins endpoint — WP 5.5+)
  console.log("─── 5. Active plugins (WP 5.5+) ───")
  const { status: s5, body: plugins } = await wpGet("/wp/v2/plugins")
  if (s5 === 200 && Array.isArray(plugins)) {
    const avatarPlugins = (plugins as Array<{ plugin: string; status: string; name: string }>)
      .filter(p => p.status === "active" && /avatar|user.?photo|profile.?pic/i.test(p.name + p.plugin))
    console.log(avatarPlugins.length
      ? avatarPlugins.map(p => `${p.name} (${p.plugin})`).join("\n")
      : "(no avatar-related plugins found active)")
  } else {
    console.log(`status ${s5} — plugins endpoint not accessible (need manage_plugins cap)`)
  }
  console.log()

  console.log("=== Done ===")
}

main().catch(e => { console.error(e); process.exit(1) })
