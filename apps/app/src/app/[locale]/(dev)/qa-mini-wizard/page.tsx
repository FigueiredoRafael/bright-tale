'use client'

import { useState } from 'react'
import { useMachine } from '@xstate/react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import {
  PipelineSettingsProvider,
  usePipelineSettings,
} from '@/providers/PipelineSettingsProvider'
import { MiniWizardSheet } from '@/components/pipeline/MiniWizardSheet'
import { Button } from '@/components/ui/button'

function ActorBoot() {
  const { pipelineSettings, creditSettings, isLoaded } = usePipelineSettings()
  const [isOpen, setIsOpen] = useState(true)

  const [, , actorRef] = useMachine(pipelineMachine, {
    input: {
      projectId: 'qa-mini-wizard-project-1',
      channelId: 'qa-mini-wizard-channel-1',
      projectTitle: 'QA MiniWizard Harness',
      pipelineSettings,
      creditSettings,
      mode: null,
    },
     
  } as any)

  if (!isLoaded) {
    return <div className="p-6 text-sm text-muted-foreground">Loading settings…</div>
  }

  return (
    <PipelineActorProvider value={actorRef}>
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-lg font-semibold mb-4">QA MiniWizard Harness</h1>
        {!isOpen && (
          <Button onClick={() => setIsOpen(true)} data-testid="reopen-sheet">
            Reopen sheet
          </Button>
        )}
        <MiniWizardSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </div>
    </PipelineActorProvider>
  )
}

export default function QAMiniWizardPage() {
  if (process.env.NEXT_PUBLIC_E2E !== '1') {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        QA harness only available in E2E mode (NEXT_PUBLIC_E2E=1).
      </div>
    )
  }

  return (
    <PipelineSettingsProvider>
      <ActorBoot />
    </PipelineSettingsProvider>
  )
}
