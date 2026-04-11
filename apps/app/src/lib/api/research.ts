/**
 * Client-side API helpers for research-related operations.
 */

export interface CreateProjectInput {
  title: string;
  current_stage: string;
  status: string;
  research_id?: string;
}

export interface ProjectRecord {
  id: string;
  title: string;
  current_stage: string;
  status: string;
  research_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function createProjectFromResearch(
  input: CreateProjectInput
): Promise<ProjectRecord> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err?.error ?? 'Failed to create project');
  }

  const json = await res.json();
  return json.data ?? json;
}
