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
  const { error } = await res.json()
  if (error) throw new Error(error.message)
})
