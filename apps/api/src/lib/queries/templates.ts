import { createServiceClient } from '../supabase/index.js';
import { SupabaseError } from '../api/errors.js';

function deepMerge(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) return b; // child overrides arrays
  if (a && typeof a === "object" && b && typeof b === "object") {
    const res: any = { ...a };
    for (const key of Object.keys(b)) {
      res[key] = deepMerge(a[key], b[key]);
    }
    return res;
  }
  return b === undefined ? a : b;
}

export async function resolveTemplate(
  templateId: string,
  seen = new Set<string>(),
): Promise<any | null> {
  const sb = createServiceClient();
  const { data: template, error } = await sb
    .from('templates')
    .select('*, parent:parent_template_id(*)')
    .eq('id', templateId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new SupabaseError(error);
  }
  if (!template) return null;

  if (seen.has(templateId))
    throw new Error("Circular template parent reference detected");
  seen.add(templateId);

  const config = JSON.parse(template.config_json || "{}");

  if (template.parent) {
    const parentResolved = await resolveTemplate((template.parent as any).id, seen);
    return deepMerge(parentResolved || {}, config);
  }

  return config;
}
