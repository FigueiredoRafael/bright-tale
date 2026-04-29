'use client'

import { useState } from 'react'
import { PickChannelModal } from '@/components/pipeline/PickChannelModal'

export default function QAPickChannelPage() {
  if (process.env.NEXT_PUBLIC_E2E !== '1') {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        QA harness only available in E2E mode (NEXT_PUBLIC_E2E=1).
      </div>
    )
  }

  return <PickChannelHarness />
}

function PickChannelHarness() {
  const [picked, setPicked] = useState<string | null>(null)

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">QA PickChannel Harness</h1>
      {picked && (
        <p className="text-sm mb-4 text-muted-foreground">
          Picked: <span data-testid="picked-channel-id">{picked}</span>
        </p>
      )}
      {/* channelId=null forces the modal to load channels via /api/channels */}
      <PickChannelModal
        projectId="qa-pick-channel-project-1"
        channelId={null}
        onPicked={(id) => setPicked(id)}
      />
    </div>
  )
}
