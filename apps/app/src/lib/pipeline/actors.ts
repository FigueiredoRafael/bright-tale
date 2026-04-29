import { fromPromise } from 'xstate'

export const reproduceActor = fromPromise(async ({
  input,
}: {
  input: { draftId: string; feedbackJson: Record<string, unknown> }
}) => {
  const res = await fetch(`/api/content-drafts/${input.draftId}/reproduce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedbackJson: input.feedbackJson }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { error } = await res.json() as { data: unknown; error: { message: string } | null }
  if (error) throw new Error(error.message)
})
