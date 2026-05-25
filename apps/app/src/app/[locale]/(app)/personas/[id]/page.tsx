"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, Pencil, ChevronLeft, ToggleLeft, ToggleRight, X, Save, GitFork, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PersonaProfileCard } from "@/components/personas/PersonaProfileCard"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ChatWizard } from "@/components/chat/ChatWizard"
import Link from "next/link"
import type { Persona } from "@brighttale/shared/types/agents"
import { DEFAULT_PERSONA_TRAITS } from "@brighttale/shared/types/agents"
import { computePersonaQualityScore, buildFixerContext, buildFixerOpening, computePersonaGaps } from "@/components/engines/utils/personaScoring"
import type { PersonaFormValues } from "@/components/personas/PersonaForm"
import type { ChatMessage } from "@/components/chat/types"

function personaToFormValues(p: Persona): PersonaFormValues {
    return {
        slug: p.slug,
        name: p.name,
        bioShort: p.bioShort,
        bioLong: p.bioLong,
        primaryDomain: p.primaryDomain,
        domainLens: p.domainLens,
        approvedCategories: p.approvedCategories,
        nationality: p.nationality,
        age: p.age,
        gender: p.gender,
        languagesJson: p.languagesJson ?? [],
        traitsJson: { ...DEFAULT_PERSONA_TRAITS, ...p.traitsJson },
        writingVoiceJson: p.writingVoiceJson,
        eeatSignalsJson: p.eeatSignalsJson,
        soulJson: p.soulJson,
        archetypeSlug: p.archetypeSlug,
        avatarUrl: p.avatarUrl,
        avatarParamsJson: p.avatarParamsJson,
        wpAuthorId: p.wpAuthorId,
    }
}

export default function PersonaProfilePage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string
    const locale = params.locale as string

    const [persona, setPersona] = useState<Persona | null>(null)
    const [formValues, setFormValues] = useState<PersonaFormValues | null>(null)
    const [editing, setEditing] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [toggling, setToggling] = useState(false)
    const [saving, setSaving] = useState(false)
    const [previewing, setPreviewing] = useState(false)
    const [previewText, setPreviewText] = useState<string | null>(null)
    const [forking, setForking] = useState(false)
    const [fixerOpen, setFixerOpen] = useState(false)
    const [fixerOpenKey, setFixerOpenKey] = useState(0)
    const [fixerMessages, setFixerMessages] = useState<ChatMessage[]>([])
    const [applying, setApplying] = useState(false)

    useEffect(() => {
        fetch(`/api/personas/${id}`)
            .then(r => r.json())
            .then(({ data, error: apiError }) => {
                if (apiError) setError(apiError.message ?? "Falha ao carregar")
                else {
                    setPersona(data)
                    setFormValues(personaToFormValues(data))
                }
            })
            .catch(() => setError("Falha ao carregar persona"))
            .finally(() => setLoading(false))
    }, [id])

    async function toggleActive() {
        if (!persona) return
        setToggling(true)
        try {
            const res = await fetch(`/api/personas/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !persona.isActive }),
            })
            const { data, error: apiError } = await res.json()
            if (!apiError && data) {
                setPersona(prev => prev ? { ...prev, isActive: data.isActive } : prev)
            }
        } finally {
            setToggling(false)
        }
    }

    async function handleSave() {
        if (!formValues) return
        setSaving(true)
        try {
            const res = await fetch(`/api/personas/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formValues),
            })
            const { data, error: apiError } = await res.json()
            if (apiError) throw new Error(apiError.message)
            if (data) {
                setPersona(data)
                setFormValues(personaToFormValues(data))
            }
            setEditing(false)
        } catch {
            // stay in editing mode on error
        } finally {
            setSaving(false)
        }
    }

    async function handlePreview() {
        setPreviewText(null)
        setPreviewing(true)
        try {
            const res = await fetch(`/api/personas/${id}/preview`, { method: "POST" })
            const { data, error: apiError } = await res.json()
            if (apiError) throw new Error(apiError.message)
            setPreviewText(data?.text ?? null)
        } catch {
            setPreviewText("Erro ao gerar preview.")
        } finally {
            setPreviewing(false)
        }
    }

    async function handleFork() {
        setForking(true)
        try {
            const res = await fetch(`/api/personas/${id}/fork`, { method: "POST" })
            const { data, error: apiError } = await res.json()
            if (apiError) throw new Error(apiError.message)
            if (data?.id) router.push(`/${locale}/personas/${data.id}`)
        } catch {
            // silently fail — add toast later
        } finally {
            setForking(false)
        }
    }

    async function applyFixerPatch(patch: Record<string, unknown>) {
        if (!persona) return
        setApplying(true)
        try {
            const merged: PersonaFormValues = {
                ...personaToFormValues(persona),
                ...(patch.bioLong !== undefined ? { bioLong: patch.bioLong as string } : {}),
                ...(patch.nationality !== undefined ? { nationality: patch.nationality as string | null } : {}),
                ...(patch.age !== undefined ? { age: patch.age as number | null } : {}),
                ...(patch.gender !== undefined ? { gender: patch.gender as string | null } : {}),
                ...(patch.languagesJson !== undefined ? { languagesJson: patch.languagesJson as PersonaFormValues['languagesJson'] } : {}),
                ...(patch.soulJson ? {
                    soulJson: { ...persona.soulJson, ...(patch.soulJson as object) }
                } : {}),
                ...(patch.writingVoiceJson ? {
                    writingVoiceJson: { ...persona.writingVoiceJson, ...(patch.writingVoiceJson as object) }
                } : {}),
                ...(patch.eeatSignalsJson ? {
                    eeatSignalsJson: { ...persona.eeatSignalsJson, ...(patch.eeatSignalsJson as object) }
                } : {}),
            }
            const res = await fetch(`/api/personas/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(merged),
            })
            const { data, error: apiError } = await res.json()
            if (!apiError && data) {
                setPersona(data)
                setFormValues(personaToFormValues(data))
                setFixerMessages(prev => [
                    ...prev,
                    { role: "assistant", content: "✓ Melhorias salvas! O perfil da persona foi atualizado." },
                ])
            }
        } finally {
            setApplying(false)
            setFixerOpen(true)
        }
    }

    if (loading) return (
        <div className="flex justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    )
    if (error) return <div className="p-6 text-sm text-destructive">{error}</div>
    if (!persona || !formValues) return <div className="p-6 text-sm text-muted-foreground">Persona não encontrada.</div>

    const qualityScore = computePersonaQualityScore(persona)
    const isOwned = true // TODO: compare persona.orgId to current user's orgId once available client-side
    const isGlobal = persona.visibility === "global"
    const canEdit = isOwned

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b bg-background shrink-0">
                <div className="flex items-center gap-3">
                    <Link href={`/${locale}/personas`} className="text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold leading-none">{persona.name}</h1>
                            <Badge variant={persona.isActive ? "default" : "secondary"} className="text-[10px]">
                                {persona.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                            <Badge variant={isGlobal ? "default" : "outline"} className="text-[10px]">
                                {isGlobal ? "Global" : "Privada"}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{persona.primaryDomain}</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {/* Melhorar com IA — only show when there are actionable gaps */}
                    {canEdit && computePersonaGaps(persona).filter(g => g.field !== 'avatarUrl').length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFixerOpen(true)}
                            disabled={applying}
                            className="h-8 border-amber-400/60 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                        >
                            {applying
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                : <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                            }
                            Melhorar com IA
                        </Button>
                    )}

                    {/* Testar voz */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreview}
                        disabled={previewing || qualityScore < 30}
                        className="h-8"
                        title={qualityScore < 30 ? "Preencha mais o perfil para testar" : undefined}
                    >
                        {previewing
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            : <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        }
                        Testar voz
                    </Button>

                    {canEdit ? (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={toggleActive}
                                disabled={toggling}
                                className="h-8"
                            >
                                {toggling
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                    : persona.isActive
                                        ? <ToggleRight className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                                        : <ToggleLeft className="h-3.5 w-3.5 mr-1.5" />
                                }
                                {persona.isActive ? "Ativo" : "Inativo"}
                            </Button>

                            {editing ? (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => { setEditing(false); setFormValues(personaToFormValues(persona)) }} className="h-8" disabled={saving}>
                                        <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
                                    </Button>
                                    <Button size="sm" onClick={handleSave} disabled={saving} className="h-8">
                                        {saving
                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                            : <Save className="h-3.5 w-3.5 mr-1.5" />
                                        }
                                        Salvar
                                    </Button>
                                </>
                            ) : (
                                <Button size="sm" onClick={() => setEditing(true)} className="h-8">
                                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                                </Button>
                            )}
                        </>
                    ) : (
                        <Button size="sm" onClick={handleFork} disabled={forking} className="h-8">
                            {forking
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                : <GitFork className="h-3.5 w-3.5 mr-1.5" />
                            }
                            Fazer fork
                        </Button>
                    )}
                </div>
            </div>

            {/* Voice preview panel */}
            {previewText && (
                <div className="px-6 py-3 bg-muted/40 border-b text-sm leading-relaxed relative">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Preview de voz</p>
                    <p className="text-sm">{previewText}</p>
                    <button
                        onClick={() => setPreviewText(null)}
                        className="absolute top-3 right-4 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-5xl mx-auto w-full">
                    <PersonaProfileCard
                        persona={persona}
                        editing={editing && canEdit}
                        values={formValues}
                        onChange={setFormValues}
                        qualityScore={qualityScore}
                    />
                </div>
            </div>

            {/* Persona Fixer Drawer */}
            <Sheet open={fixerOpen} onOpenChange={open => {
                if (open) setFixerOpenKey(k => k + 1)
                setFixerOpen(open)
            }}>
                <SheetContent side="right" className="w-full sm:max-w-[560px] lg:max-w-[640px] p-0 flex flex-col">
                    <SheetHeader className="px-5 py-4 border-b shrink-0">
                        <SheetTitle className="flex items-center gap-2 text-base">
                            <Wand2 className="h-4 w-4 text-amber-500" />
                            Melhorar com IA
                        </SheetTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            A IA analisa as lacunas da persona e te ajuda a preenchê-las.
                        </p>
                    </SheetHeader>
                    <div className="flex-1 min-h-0">
                        <ChatWizard<Record<string, unknown>>
                            key={`fixer-${id}-${fixerOpenKey}`}
                            moduleId="persona_fixer"
                            messages={fixerMessages}
                            onMessagesChange={setFixerMessages}
                            onComplete={applyFixerPatch}
                            context={buildFixerContext(persona, qualityScore)}
                            initialMessage={buildFixerOpening(persona, qualityScore)}
                            skipGeneratingOverlay
                            placeholder="Responda às perguntas da IA..."
                        />
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
