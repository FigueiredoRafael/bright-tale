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

export const abortRequester = fromPromise(async ({
  input,
}: {
  input: { projectId: string }
}) => {
  const res = await fetch(`/api/projects/${input.projectId}/abort`, { method: 'PATCH' })
  if (!res.ok) throw new Error('Failed to request abort')
})
