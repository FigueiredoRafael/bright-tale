'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import type { PipelineSettings, CreditSettings } from '@/components/engines/types'

interface PipelineSettingsContextValue {
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  isLoaded: boolean
}

const PipelineSettingsContext = createContext<PipelineSettingsContextValue>({
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
  isLoaded: false,
})

export function usePipelineSettings() {
  return useContext(PipelineSettingsContext)
}

export function PipelineSettingsProvider({ children }: { children: React.ReactNode }) {
  const [pipelineSettings, setPipelineSettings] = useState<PipelineSettings>(DEFAULT_PIPELINE_SETTINGS)
  const [creditSettings, setCreditSettings] = useState<CreditSettings>(DEFAULT_CREDIT_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [psRes, csRes] = await Promise.all([
          fetch('/api/admin/pipeline-settings'),
          fetch('/api/admin/credit-settings'),
        ])
        const [{ data: ps }, { data: cs }] = await Promise.all([psRes.json(), csRes.json()])
        if (ps) setPipelineSettings(ps as PipelineSettings)
        if (cs) setCreditSettings(cs as CreditSettings)
      } finally {
        setIsLoaded(true)
      }
    }
    void load()
  }, [])

  return (
    <PipelineSettingsContext.Provider value={{ pipelineSettings, creditSettings, isLoaded }}>
      {children}
    </PipelineSettingsContext.Provider>
  )
}
