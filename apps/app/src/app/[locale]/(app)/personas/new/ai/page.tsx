"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChatWizard } from "@/components/chat/ChatWizard"
import { PersonaProfileCard } from "@/components/personas/PersonaProfileCard"
import { PersonaForm, type PersonaFormValues } from "@/components/personas/PersonaForm"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Edit, Check, User, Plus } from "lucide-react"
import type { Persona } from "@brighttale/shared/types/agents"
import { DEFAULT_PERSONA_TRAITS } from "@brighttale/shared/types/agents"
import Link from "next/link"
import Image from "next/image"

type Step = "chat" | "preview" | "form"

const FLOW_KEY = "bt_persona_wizard_flow"

interface FlowState {
  step: Step
  extracted: Record<string, unknown>
}

function buildPreviewPersona(extracted: Record<string, unknown>): Persona {
  return {
    id: "preview",
    slug: (extracted.slug as string) ?? "",
    name: (extracted.name as string) ?? "Nova Persona",
    avatarUrl: null,
    bioShort: (extracted.bioShort as string) ?? "",
    bioLong: (extracted.bioLong as string) ?? "",
    primaryDomain: (extracted.primaryDomain as string) ?? "",
    domainLens: (extracted.domainLens as string) ?? "",
    approvedCategories: (extracted.approvedCategories as string[]) ?? [],
    writingVoiceJson: (extracted.writingVoiceJson as Persona["writingVoiceJson"]) ?? { writingStyle: "", signaturePhrases: [], characteristicOpinions: [] },
    eeatSignalsJson: (extracted.eeatSignalsJson as Persona["eeatSignalsJson"]) ?? { analyticalLens: "", trustSignals: [], expertiseClaims: [] },
    soulJson: (extracted.soulJson as Persona["soulJson"]) ?? { values: [], lifePhilosophy: "", strongOpinions: [], petPeeves: [], humorStyle: "", recurringJokes: [], whatExcites: [], innerTensions: [], languageGuardrails: [] },
    traitsJson: (extracted.traitsJson as Persona["traitsJson"]) ?? { ...DEFAULT_PERSONA_TRAITS },
    wpAuthorId: null,
    archetypeSlug: null,
    avatarParamsJson: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ─── History sidebar ──────────────────────────────────────────────────────────

interface PersonaStub {
  id: string
  name: string
  primaryDomain: string
  avatarUrl: string | null
  slug: string
}

function PersonaHistory({ locale }: { locale: string }) {
  const [personas, setPersonas] = useState<PersonaStub[]>([])

  useEffect(() => {
    fetch("/api/personas")
      .then(r => r.json())
      .then(({ data }) => {
        if (Array.isArray(data)) setPersonas((data as PersonaStub[]).slice(0, 5))
      })
      .catch(() => { /* silent */ })
  }, [])

  if (personas.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Personas criadas
      </p>
      <div className="space-y-2">
        {personas.map(p => (
          <Link
            key={p.id}
            href={`/${locale}/personas/${p.id}`}
            className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 hover:border-primary/30 transition-colors group"
          >
            <div className="relative h-8 w-8 rounded-full overflow-hidden bg-muted shrink-0">
              {p.avatarUrl ? (
                <Image src={p.avatarUrl} alt={p.name} fill sizes="32px" className="object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.name}</p>
              <p className="text-xs text-muted-foreground truncate">{p.primaryDomain}</p>
            </div>
          </Link>
        ))}
      </div>
      <Link
        href={`/${locale}/personas`}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <Plus className="h-3 w-3" />
        Ver todas as personas
      </Link>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewPersonaAiPage() {
  const params = useParams()
  const locale = params.locale as string
  const router = useRouter()

  // Lazy initializers read localStorage once at mount — avoids effect cascades
  const [step, setStep] = useState<Step>(() => {
    try {
      const raw = localStorage.getItem(FLOW_KEY)
      if (!raw) return "chat"
      const saved = JSON.parse(raw) as FlowState
      return saved.step ?? "chat"
    } catch { return "chat" }
  })
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(() => {
    try {
      const raw = localStorage.getItem(FLOW_KEY)
      if (!raw) return null
      const saved = JSON.parse(raw) as FlowState
      return saved.extracted ?? null
    } catch { return null }
  })

  // Persist step + extracted to localStorage on every change
  useEffect(() => {
    if (extracted) {
      try {
        localStorage.setItem(FLOW_KEY, JSON.stringify({ step, extracted }))
      } catch { /* ignore */ }
    }
  }, [step, extracted])

  function handleChatComplete(data: Record<string, unknown>) {
    setExtracted(data)
    setStep("preview")
  }

  function handleSaved() {
    try { localStorage.removeItem(FLOW_KEY) } catch { /* ignore */ }
    router.push(`/${locale}/personas`)
  }

  if (step === "preview" && extracted) {
    const preview = buildPreviewPersona(extracted)
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("chat")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Sua Persona</h1>
            <p className="text-sm text-muted-foreground">Confira o resultado. Você pode ajustar antes de salvar.</p>
          </div>
        </div>

        <PersonaProfileCard persona={preview} />

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setStep("form")}>
            <Edit className="h-4 w-4 mr-2" />
            Ajustar no formulário
          </Button>
          <Button onClick={() => setStep("form")}>
            <Check className="h-4 w-4 mr-2" />
            Salvar assim
          </Button>
        </div>
      </div>
    )
  }

  if (step === "form" && extracted) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("preview")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Revisar e Salvar</h1>
            <p className="text-sm text-muted-foreground">Ajuste o que precisar antes de criar a persona.</p>
          </div>
        </div>
        <PersonaForm
          initial={extracted as Partial<PersonaFormValues>}
          onSaved={handleSaved}
        />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex gap-6">
        {/* Main: chat */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <Link href={`/${locale}/personas/new`} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Criar Persona com IA</h1>
              <p className="text-sm text-muted-foreground">Converse com a IA e ela monta tudo automaticamente.</p>
            </div>
          </div>

          <div className="border rounded-2xl overflow-hidden bg-card" style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>
            <ChatWizard<Record<string, unknown>>
              moduleId="persona_wizard"
              sessionKey="persona_wizard"
              onComplete={handleChatComplete}
              placeholder="Conta quem é a sua persona..."
            />
          </div>
        </div>

        {/* Sidebar: history */}
        <div className="w-56 shrink-0 pt-16 hidden lg:block">
          <PersonaHistory locale={locale} />
        </div>
      </div>
    </div>
  )
}
