"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, Loader2 } from "lucide-react"
import { AvatarSection } from "./AvatarSection"
import { WpIntegrationSection } from "./WpIntegrationSection"

export interface PersonaFormValues {
    slug: string
    name: string
    bioShort: string
    bioLong: string
    primaryDomain: string
    domainLens: string
    approvedCategories: string[]
    writingVoiceJson: { writingStyle: string; signaturePhrases: string[]; characteristicOpinions: string[] }
    eeatSignalsJson: { analyticalLens: string; trustSignals: string[]; expertiseClaims: string[] }
    soulJson: {
        values: string[]; lifePhilosophy: string; strongOpinions: string[]
        petPeeves: string[]; humorStyle: string; recurringJokes: string[]
        whatExcites: string[]; innerTensions: string[]; languageGuardrails: string[]
    }
    archetypeSlug?: string | null
    avatarUrl?: string | null
    avatarParamsJson?: Record<string, unknown> | null
}

const EMPTY: PersonaFormValues = {
    slug: "", name: "", bioShort: "", bioLong: "",
    primaryDomain: "", domainLens: "", approvedCategories: [],
    writingVoiceJson: { writingStyle: "", signaturePhrases: [], characteristicOpinions: [] },
    eeatSignalsJson: { analyticalLens: "", trustSignals: [], expertiseClaims: [] },
    soulJson: {
        values: [], lifePhilosophy: "", strongOpinions: [], petPeeves: [],
        humorStyle: "", recurringJokes: [], whatExcites: [], innerTensions: [], languageGuardrails: [],
    },
    archetypeSlug: null, avatarUrl: null, avatarParamsJson: null,
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
    const [input, setInput] = useState("")
    function add() {
        const trimmed = input.trim()
        if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
        setInput("")
    }
    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())} placeholder={placeholder} className="h-8 text-sm" />
                <Button size="sm" type="button" variant="outline" onClick={add}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1">
                {value.map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs">
                        {tag}
                        <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="hover:text-destructive">×</button>
                    </span>
                ))}
            </div>
        </div>
    )
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-3 border-b text-sm font-semibold hover:text-primary transition-colors">
                {title}
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 pb-2 space-y-4">
                {children}
            </CollapsibleContent>
        </Collapsible>
    )
}

interface PersonaFormProps {
    initial?: Partial<PersonaFormValues>
    personaId?: string
    archetypeSlug?: string
}

export function PersonaForm({ initial, personaId, archetypeSlug }: PersonaFormProps) {
    const [values, setValues] = useState<PersonaFormValues>({ ...EMPTY, ...initial, archetypeSlug: archetypeSlug ?? initial?.archetypeSlug ?? null })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
    const params = useParams()
    const locale = params.locale as string

    function set<K extends keyof PersonaFormValues>(key: K, val: PersonaFormValues[K]) {
        setValues(prev => ({ ...prev, [key]: val }))
    }

    const canSubmit = values.name.trim().length > 0 && values.slug.trim().length > 0 && values.bioShort.trim().length > 0 && values.primaryDomain.trim().length > 0

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setError(null)
        try {
            const url = personaId ? `/api/personas/${personaId}` : "/api/personas"
            const method = personaId ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            })
            const { data, error: apiError } = await res.json()
            if (apiError) throw new Error(apiError.message)
            router.push(`/${locale}/personas`)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save")
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-2">
            <Section title="Identity" defaultOpen>
                <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input value={values.name} onChange={e => set("name", e.target.value)} placeholder="Alex Strand" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Slug</Label>
                            <Input value={values.slug} onChange={e => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="alex-strand" disabled={!!personaId} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Short Bio</Label>
                        <Input value={values.bioShort} onChange={e => set("bioShort", e.target.value)} placeholder="1-2 sentence summary" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Long Bio</Label>
                        <Textarea value={values.bioLong} onChange={e => set("bioLong", e.target.value)} placeholder="3-5 sentence detailed background" className="min-h-[80px]" />
                    </div>
                </div>
            </Section>

            <Section title="Domain & Niche">
                <div className="grid gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Primary Domain</Label>
                        <Input value={values.primaryDomain} onChange={e => set("primaryDomain", e.target.value)} placeholder="Personal Finance" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Domain Lens (unique angle)</Label>
                        <Input value={values.domainLens} onChange={e => set("domainLens", e.target.value)} placeholder="Data-driven FIRE methodology" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Approved Topic Categories</Label>
                        <TagInput value={values.approvedCategories} onChange={v => set("approvedCategories", v)} placeholder="Add category..." />
                    </div>
                </div>
            </Section>

            <Section title="Voice">
                <div className="grid gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Writing Style</Label>
                        <Input value={values.writingVoiceJson.writingStyle} onChange={e => set("writingVoiceJson", { ...values.writingVoiceJson, writingStyle: e.target.value })} placeholder="Direct, data-driven, no fluff" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Signature Phrases</Label>
                        <TagInput value={values.writingVoiceJson.signaturePhrases} onChange={v => set("writingVoiceJson", { ...values.writingVoiceJson, signaturePhrases: v })} placeholder="Add phrase..." />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Characteristic Opinions</Label>
                        <TagInput value={values.writingVoiceJson.characteristicOpinions} onChange={v => set("writingVoiceJson", { ...values.writingVoiceJson, characteristicOpinions: v })} placeholder="Add opinion..." />
                    </div>
                </div>
            </Section>

            <Section title="Soul">
                <div className="grid gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Core Values</Label>
                        <TagInput value={values.soulJson.values} onChange={v => set("soulJson", { ...values.soulJson, values: v })} placeholder="Add value..." />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Life Philosophy</Label>
                        <Input value={values.soulJson.lifePhilosophy} onChange={e => set("soulJson", { ...values.soulJson, lifePhilosophy: e.target.value })} placeholder="One guiding belief" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Strong Opinions</Label>
                        <TagInput value={values.soulJson.strongOpinions} onChange={v => set("soulJson", { ...values.soulJson, strongOpinions: v })} placeholder="Add opinion..." />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Pet Peeves</Label>
                        <TagInput value={values.soulJson.petPeeves} onChange={v => set("soulJson", { ...values.soulJson, petPeeves: v })} placeholder="Add pet peeve..." />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Humor Style</Label>
                        <Input value={values.soulJson.humorStyle} onChange={e => set("soulJson", { ...values.soulJson, humorStyle: e.target.value })} placeholder="Dry wit, self-deprecating..." />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">What Excites Them</Label>
                        <TagInput value={values.soulJson.whatExcites} onChange={v => set("soulJson", { ...values.soulJson, whatExcites: v })} placeholder="Add topic..." />
                    </div>
                </div>
            </Section>

            <Section title="EEAT">
                <div className="grid gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Analytical Lens</Label>
                        <Input value={values.eeatSignalsJson.analyticalLens} onChange={e => set("eeatSignalsJson", { ...values.eeatSignalsJson, analyticalLens: e.target.value })} placeholder="How they analyze information" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Trust Signals</Label>
                        <TagInput value={values.eeatSignalsJson.trustSignals} onChange={v => set("eeatSignalsJson", { ...values.eeatSignalsJson, trustSignals: v })} placeholder="Add signal..." />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Expertise Claims</Label>
                        <TagInput value={values.eeatSignalsJson.expertiseClaims} onChange={v => set("eeatSignalsJson", { ...values.eeatSignalsJson, expertiseClaims: v })} placeholder="Add claim..." />
                    </div>
                </div>
            </Section>

            <Section title="Avatar">
                <AvatarSection
                    personaId={personaId ?? ""}
                    currentUrl={values.avatarUrl ?? null}
                    onAccept={(url, params) => {
                        set("avatarUrl", url)
                        set("avatarParamsJson", params)
                    }}
                />
            </Section>

            <Section title="Integrations">
                {personaId ? (
                    <WpIntegrationSection personaId={personaId} currentWpAuthorId={null} />
                ) : (
                    <p className="text-xs text-muted-foreground">Save the persona first to connect WordPress.</p>
                )}
            </Section>

            <div className="pt-4 flex flex-col items-end gap-2">
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="submit" disabled={saving || !canSubmit}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {personaId ? "Save Changes" : "Create Persona"}
                </Button>
            </div>
        </form>
    )
}
