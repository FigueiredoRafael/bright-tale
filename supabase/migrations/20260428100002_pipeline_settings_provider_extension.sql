-- Extend pipeline_settings.default_providers_json to include canonicalCore + assets.
-- Backfill from brainstorm to preserve user intent; admin can change later via pipeline settings UI.

update pipeline_settings
   set default_providers_json = jsonb_set(
     jsonb_set(
       default_providers_json,
       '{canonicalCore}',
       to_jsonb(coalesce(default_providers_json->>'brainstorm', 'gemini')),
       true
     ),
     '{assets}',
     to_jsonb(coalesce(default_providers_json->>'brainstorm', 'gemini')),
     true
   )
 where not (default_providers_json ? 'canonicalCore' and default_providers_json ? 'assets');
