import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '../machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'

function ProjectIdProbe({ testId }: { testId: string }) {
  const actor = usePipelineActor()
  return <span data-testid={testId}>{actor.getSnapshot().context.projectId}</span>
}

describe('PipelineActorProvider', () => {
  it('isolates actors between sibling providers', () => {
    const a = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-A',
        channelId: 'ch',
        projectTitle: 't',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start()
    const b = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-B',
        channelId: 'ch',
        projectTitle: 't',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start()

    render(
      <>
        <PipelineActorProvider value={a}>
          <ProjectIdProbe testId="a" />
        </PipelineActorProvider>
        <PipelineActorProvider value={b}>
          <ProjectIdProbe testId="b" />
        </PipelineActorProvider>
      </>
    )

    expect(screen.getByTestId('a').textContent).toBe('proj-A')
    expect(screen.getByTestId('b').textContent).toBe('proj-B')
  })

  it('throws a helpful error when used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ProjectIdProbe testId="x" />)).toThrow(/must be used inside/)
    spy.mockRestore()
  })
})
