import { useCallback } from 'react';
import type { IdeaRow } from '@/app/[locale]/(app)/ideas/[id]/page.client';

export function useIdeaPatch(ideaId: string, current: IdeaRow | null) {
  const patch = useCallback(
    async (body: Record<string, unknown>): Promise<IdeaRow> => {
      const res = await fetch(`/api/ideas/library/${ideaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
      }
      return json.data.idea as IdeaRow;
    },
    [ideaId],
  );

  const patchDiscovery = useCallback(
    async (partial: Record<string, unknown>): Promise<IdeaRow> => {
      const merged = { ...(current?.discovery_data ?? {}), ...partial };
      return patch({ discovery_data: merged });
    },
    [current, patch],
  );

  return { patch, patchDiscovery };
}
