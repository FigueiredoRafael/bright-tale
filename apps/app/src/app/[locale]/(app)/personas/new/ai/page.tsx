"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChatWizard } from "@/components/chat/ChatWizard"
import { PersonaProfileCard } from "@/components/personas/PersonaProfileCard"
import { PersonaForm, type PersonaFormValues } from "@/components/personas/PersonaForm"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Edit, Check, Plus, MessageSquare, CheckCircle2 } from "lucide-react"
import type { Persona } from "@brighttale/shared/types/agents"
import { DEFAULT_PERSONA_TRAITS } from "@brighttale/shared/types/agents"
import type { ChatMessage } from "@/components/chat/types"
import Link from "next/link"

// ─── Session data model ───────────────────────────────────────────────────────

interface WizardSession {
  id: string
  name: string
  messages: ChatMessage[]
  savedAt: number
  step: "chat" | "preview" | "form"
  extracted: Record<string, unknown> | null
  personaId: string | null
}

const SESSIONS_KEY = "bt_wizard_sessions_v2"
const ACTIVE_KEY = "bt_wizard_active_v2"

function createSession(): WizardSession {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Nova Persona",
    messages: [],
    savedAt: Date.now(),
    step: "chat",
    extracted: null,
    personaId: null,
  }
}

function loadSessions(): WizardSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WizardSession[]
  } catch {
    return []
  }
}

function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

function saveSessions(sessions: WizardSession[], activeId: string) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
    localStorage.setItem(ACTIVE_KEY, activeId)
  } catch { /* quota exceeded — ignore */ }
}

// ─── buildPreviewPersona ──────────────────────────────────────────────────────

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

// ─── Sessions sidebar ─────────────────────────────────────────────────────────

interface SessionSidebarProps {
  sessions: WizardSession[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
}

function SessionSidebar({ sessions, activeId, onSelect, onNew }: SessionSidebarProps) {
  const sorted = [...sessions].sort((a, b) => b.savedAt - a.savedAt)

  return (
    <aside className="w-[220px] shrink-0 flex flex-col border-r bg-muted/20 h-full">
      <div className="p-3 border-b">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-sm"
          onClick={onNew}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova conversa
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
        {sorted.map(session => {
          const isActive = session.id === activeId
          const isDone = session.personaId !== null

          return (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={`w-full text-left rounded-lg px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                isActive
                  ? "bg-primary/10 text-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {/* Status dot */}
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : isActive ? (
                <span className="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{session.name}</p>
                {isDone && (
                  <p className="text-[10px] text-emerald-500 truncate">persona salva</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function initState(): { sessions: WizardSession[]; activeId: string } {
  const loaded = loadSessions()
  if (loaded.length === 0) {
    const initial = createSession()
    return { sessions: [initial], activeId: initial.id }
  }
  const stored = loadActiveId()
  const sorted = [...loaded].sort((a, b) => b.savedAt - a.savedAt)
  const activeId = stored && loaded.some(s => s.id === stored) ? stored : sorted[0].id
  return { sessions: loaded, activeId }
}

export default function NewPersonaAiPage() {
  const params = useParams()
  const locale = params.locale as string
  const router = useRouter()

  // Lazy-init sessions and activeId from localStorage in a single pass
  const [{ sessions, activeId: initialActiveId }] = useState(initState)
  const [sessionList, setSessions] = useState<WizardSession[]>(sessions)
  const [activeSessionId, setActiveSessionId] = useState<string>(initialActiveId)

  // Persist sessions + activeId to localStorage on every change (debounced)
  useEffect(() => {
    if (!activeSessionId) return
    const timer = setTimeout(() => {
      saveSessions(sessionList, activeSessionId)
    }, 200)
    return () => clearTimeout(timer)
  }, [sessionList, activeSessionId])

  // ── Session helpers ──────────────────────────────────────────────────────

  const updateSession = useCallback((id: string, patch: Partial<WizardSession>) => {
    setSessions(prev =>
      prev.map(s => s.id === id ? { ...s, ...patch, savedAt: Date.now() } : s)
    )
  }, [])

  const activeSession = sessionList.find(s => s.id === activeSessionId) ?? sessionList[0]

  function handleNewSession() {
    const session = createSession()
    setSessions(prev => [...prev, session])
    setActiveSessionId(session.id)
  }

  function handleSelectSession(id: string) {
    setActiveSessionId(id)
  }

  // ── Chat callbacks ───────────────────────────────────────────────────────

  function handleMessagesChange(messages: ChatMessage[]) {
    if (!activeSession) return
    updateSession(activeSession.id, { messages })
  }

  function handleChatComplete(data: Record<string, unknown>) {
    if (!activeSession) return
    updateSession(activeSession.id, {
      step: "preview",
      extracted: data,
      name: (data.name as string) ?? activeSession.name,
    })
  }

  function handleSaved() {
    if (!activeSession) return
    updateSession(activeSession.id, {
      step: "chat",
      personaId: "saved",
      extracted: null,
    })
    router.push(`/${locale}/personas`)
  }

  // ── Render active session content ────────────────────────────────────────

  if (!activeSession) return null

  const { step, extracted } = activeSession

  function renderContent() {
    if (step === "preview" && extracted) {
      const preview = buildPreviewPersona(extracted)
      return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateSession(activeSession.id, { step: "chat" })}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Sua Persona</h1>
              <p className="text-sm text-muted-foreground">Confira o resultado. Você pode ajustar antes de salvar.</p>
            </div>
          </div>

          <PersonaProfileCard persona={preview} />

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => updateSession(activeSession.id, { step: "form" })}>
              <Edit className="h-4 w-4 mr-2" />
              Ajustar no formulário
            </Button>
            <Button onClick={() => updateSession(activeSession.id, { step: "form" })}>
              <Check className="h-4 w-4 mr-2" />
              Salvar assim
            </Button>
          </div>
        </div>
      )
    }

    if (step === "form" && extracted) {
      return (
        <div className="flex-1 overflow-y-auto p-6 max-w-2xl w-full mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateSession(activeSession.id, { step: "preview" })}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
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

    // step === "chat"
    return (
      <div className="flex-1 flex flex-col min-h-0 p-4">
        <div className="flex-1 border rounded-2xl overflow-hidden bg-card min-h-0">
          <ChatWizard<Record<string, unknown>>
            key={activeSession.id}
            moduleId="persona_wizard"
            messages={activeSession.messages}
            onMessagesChange={handleMessagesChange}
            onComplete={handleChatComplete}
            placeholder="Conta quem é a sua persona..."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Sessions sidebar — hidden on mobile */}
      <div className="hidden lg:flex">
        <SessionSidebar
          sessions={sessionList}
          activeId={activeSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b bg-background shrink-0">
          <Link
            href={`/${locale}/personas/new`}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Criar Persona com IA</h1>
            <p className="text-sm text-muted-foreground">
              {activeSession.name !== "Nova Persona" ? activeSession.name : "Converse com a IA e ela monta tudo automaticamente."}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
