'use client'
import { createContext, useContext, useEffect, useState } from 'react'

const Ctx = createContext<AbortController | null>(null)

export const usePipelineAbort = () => useContext(Ctx)

interface PipelineAbortProviderProps {
  projectId: string
  machineState: 'setup' | 'running' | 'done'
  currentStage: string
  isPaused: boolean
  children: React.ReactNode
}

export function PipelineAbortProvider({
  projectId,
  machineState,
  currentStage,
  isPaused,
  children,
}: PipelineAbortProviderProps) {
  const [controller, setController] = useState<AbortController>(() => new AbortController())
  const [prevStage, setPrevStage] = useState(currentStage)

  if (prevStage !== currentStage) {
    setPrevStage(currentStage)
    setController(new AbortController())
  }

  useEffect(() => {
    if (machineState === 'setup' || machineState === 'done') return

    const interval = isPaused ? 10_000 : 3_000
    let lastAbortAt: string | null = null

    const tick = async () => {
      let res: Response
      try {
        res = await fetch(`/api/projects/${projectId}`, {
          headers: { 'Cache-Control': 'max-age=1' },
        })
      } catch {
        return
      }
      if (!res.ok) return

      const body = await res.json() as { data: { abortRequestedAt: string | null } | null; error: unknown }
      if (body.error !== null || body.data === null) return

      const next = body.data.abortRequestedAt ?? null
      if (next !== lastAbortAt) {
        lastAbortAt = next
        if (next !== null) {
          controller.abort()
        }
      }
    }

    const id = setInterval(tick, interval)
    return () => clearInterval(id)
  }, [projectId, machineState, isPaused, controller])

  return <Ctx.Provider value={controller}>{children}</Ctx.Provider>
}
