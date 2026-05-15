'use client';

interface WriteOutcomeArgs {
  projectId: string;
  stageRunId: string;
  outcome: Record<string, unknown>;
}

export async function writeStageRunOutcome({
  projectId,
  stageRunId,
  outcome,
}: WriteOutcomeArgs): Promise<unknown> {
  const res = await fetch(
    `/api/projects/${projectId}/stage-runs/${stageRunId}/manual-output`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    },
  );
  const { data, error } = (await res.json()) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return data;
}
