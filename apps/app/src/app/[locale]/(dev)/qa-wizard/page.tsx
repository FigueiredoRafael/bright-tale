'use client'

import { useMachine } from '@xstate/react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import {
  PipelineSettingsProvider,
  usePipelineSettings,
} from '@/providers/PipelineSettingsProvider'
import { PipelineWizard } from '@/components/pipeline/PipelineWizard'

function ActorBoot() {
  const { pipelineSettings, creditSettings, isLoaded } = usePipelineSettings()

  const [, , actorRef] = useMachine(pipelineMachine, {
    input: {
      projectId: 'qa-wizard-project-1',
      channelId: 'qa-wizard-channel-1',
      projectTitle: 'QA Wizard Harness',
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
        <h1 className="text-lg font-semibold mb-4">QA Wizard Harness</h1>
        <PipelineWizard />
      </div>
    </PipelineActorProvider>
  )
}

export default function QAWizardPage() {
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
