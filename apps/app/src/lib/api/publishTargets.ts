import type { PublishTarget } from '@brighttale/shared';

// removed: TODO T6.1 — GET /api/publish-targets/:id server route is deferred.
// This helper calls the route once it exists; tests mock it at this module boundary.
export async function fetchPublishTarget(id: string): Promise<PublishTarget> {
  const res = await fetch(`/api/publish-targets/${id}`);
  const { data, error } = (await res.json()) as { data: PublishTarget | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Publish target ${id} not found`);
  return data;
}
