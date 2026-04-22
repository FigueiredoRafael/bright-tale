import type { IdeaRow } from '@/app/[locale]/(app)/ideas/[id]/page.client';

// discovery_data is stored as a JSON string (zod schema: z.string()),
// but consumed as an object in the UI. Parse on API → UI.
export function parseIdea(raw: unknown): IdeaRow {
  const r = raw as IdeaRow & { discovery_data: string | Record<string, unknown> | null };
  if (typeof r.discovery_data === 'string' && r.discovery_data.length > 0) {
    try {
      return { ...r, discovery_data: JSON.parse(r.discovery_data) as Record<string, unknown> };
    } catch {
      return { ...r, discovery_data: null };
    }
  }
  return r as IdeaRow;
}
