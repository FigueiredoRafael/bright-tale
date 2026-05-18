"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2, Pencil, ChevronLeft, ToggleLeft, ToggleRight, X, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PersonaProfileCard } from "@/components/personas/PersonaProfileCard"
import Link from "next/link"
import type { Persona } from "@brighttale/shared/types/agents"
import { DEFAULT_PERSONA_TRAITS } from "@brighttale/shared/types/agents"
import type { PersonaFormValues } from "@/components/personas/PersonaForm"

function personaToFormValues(p: Persona): PersonaFormValues {
    return {
        slug: p.slug,
        name: p.name,
        bioShort: p.bioShort,
        bioLong: p.bioLong,
        primaryDomain: p.primaryDomain,
        domainLens: p.domainLens,
        approvedCategories: p.approvedCategories,
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
    const id = params.id as string
    const locale = params.locale as string

    const [persona, setPersona] = useState<Persona | null>(null)
    const [formValues, setFormValues] = useState<PersonaFormValues | null>(null)
    const [editing, setEditing] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [toggling, setToggling] = useState(false)
    const [saving, setSaving] = useState(false)

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
            const res = await fetch(`/api/personas/${id}/toggle`, {
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

    if (loading) return (
        <div className="flex justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    )
    if (error) return <div className="p-6 text-sm text-destructive">{error}</div>
    if (!persona || !formValues) return <div className="p-6 text-sm text-muted-foreground">Persona não encontrada.</div>

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
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{persona.primaryDomain}</p>
                    </div>
                </div>
                <div className="flex gap-2">
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
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-5xl mx-auto w-full">
                    <PersonaProfileCard
                        persona={persona}
                        editing={editing}
                        values={formValues}
                        onChange={setFormValues}
                    />
                </div>
            </div>
        </div>
    )
}
