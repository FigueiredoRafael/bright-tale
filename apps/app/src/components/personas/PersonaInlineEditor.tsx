"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PersonaRadar } from "./PersonaRadar"
import { AvatarSection } from "./AvatarSection"
import { Loader2, X } from "lucide-react"
import type { PersonaTraits } from "@brighttale/shared/types/agents"
import { DEFAULT_PERSONA_TRAITS } from "@brighttale/shared/types/agents"
import type { PersonaFormValues } from "./PersonaForm"

// ─── Option lists ─────────────────────────────────────────────────────────────

const DOMAIN_OPTIONS = [
    "Finanças Pessoais", "Investimentos", "Empreendedorismo", "Marketing Digital",
    "Criação de Conteúdo", "Fitness & Saúde", "Nutrição & Bem-estar",
    "Tecnologia", "Desenvolvimento Pessoal", "E-commerce", "Carreira",
    "Relacionamentos", "Educação", "Outro",
]

const WRITING_STYLE_OPTIONS = [
    "Direto e objetivo",
    "Analítico e detalhado",
    "Inspiracional e motivacional",
    "Técnico e especializado",
    "Conversacional e próximo",
    "Provocativo e questionador",
    "Educativo e didático",
    "Narrativo e storytelling",
    "Outro",
]

const HUMOR_STYLE_OPTIONS = [
    "Sem humor (formal)",
    "Ironia sutil",
    "Wit seco (dry wit)",
    "Auto-depreciativo",
    "Referências culturais",
    "Absurdo / Non-sequitur",
    "Outro",
]

const TRAIT_LABELS: Record<keyof PersonaTraits, string> = {
    empatia: "Empatia", profundidade: "Profundidade", provocacao: "Provocação",
    singularidade: "Singularidade", narrativa: "Narrativa", autoridade: "Autoridade",
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            {children}
        </div>
    )
}

function SelectOrOther({
    value, onChange, options, placeholder,
}: {
    value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
    const isCustom = value !== "" && !options.slice(0, -1).includes(value)
    const [showCustom, setShowCustom] = useState(isCustom)

    function handleSelect(v: string) {
        if (v === "Outro") { setShowCustom(true); return }
        setShowCustom(false)
        onChange(v)
    }

    if (showCustom) {
        return (
            <div className="flex gap-1">
                <Input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="h-8 text-sm"
                    autoFocus
                />
                <Button
                    type="button" size="icon" variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => { setShowCustom(false); onChange("") }}
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>
        )
    }

    return (
        <Select value={options.includes(value) ? value : ""} onValueChange={handleSelect}>
            <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={placeholder ?? "Selecionar..."} />
            </SelectTrigger>
            <SelectContent>
                {options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
        </Select>
    )
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
    const [input, setInput] = useState("")
    function add() {
        const t = input.trim()
        if (t && !value.includes(t)) onChange([...value, t])
        setInput("")
    }
    return (
        <div className="space-y-1.5">
            <div className="flex gap-1.5">
                <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
                    placeholder={placeholder}
                    className="h-7 text-xs"
                />
                <Button type="button" size="sm" variant="outline" onClick={add} className="h-7 px-2 text-xs">+</Button>
            </div>
            <div className="flex flex-wrap gap-1">
                {value.map(tag => (
                    <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-muted rounded-full text-[11px]">
                        {tag}
                        <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="hover:text-destructive ml-0.5">×</button>
                    </span>
                ))}
            </div>
        </div>
    )
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = ["Identidade", "Domínio", "Voz", "Alma", "EEAT", "Forças", "Avatar"] as const
type Tab = typeof TABS[number]

// ─── Main component ───────────────────────────────────────────────────────────

interface PersonaInlineEditorProps {
    values: PersonaFormValues
    personaId: string
    onChange: (v: PersonaFormValues) => void
    onSaved: () => void
}

export function PersonaInlineEditor({ values, personaId, onChange, onSaved }: PersonaInlineEditorProps) {
    const [tab, setTab] = useState<Tab>("Identidade")
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    function set<K extends keyof PersonaFormValues>(key: K, val: PersonaFormValues[K]) {
        onChange({ ...values, [key]: val })
    }

    async function save() {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/personas/${personaId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            })
            const { error: apiError } = await res.json()
            if (apiError) throw new Error(apiError.message)
            onSaved()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erro ao salvar")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex gap-0.5 flex-wrap px-3 pt-3 pb-0 border-b">
                {TABS.map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${tab === t
                            ? "bg-background border border-b-background text-foreground -mb-px z-10"
                            : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {tab === "Identidade" && (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Nome">
                                <Input value={values.name} onChange={e => set("name", e.target.value)} className="h-8 text-sm" />
                            </Field>
                            <Field label="Slug">
                                <Input value={values.slug} disabled className="h-8 text-sm opacity-50" />
                            </Field>
                        </div>
                        <Field label="Bio curta">
                            <Input value={values.bioShort} onChange={e => set("bioShort", e.target.value)} placeholder="1-2 frases" className="h-8 text-sm" />
                        </Field>
                        <Field label="Bio longa">
                            <Textarea
                                value={values.bioLong}
                                onChange={e => set("bioLong", e.target.value)}
                                placeholder="3-5 frases com background detalhado"
                                className="text-sm min-h-[80px] resize-none"
                            />
                        </Field>
                    </>
                )}

                {tab === "Domínio" && (
                    <>
                        <Field label="Domínio principal">
                            <SelectOrOther
                                value={values.primaryDomain}
                                onChange={v => set("primaryDomain", v)}
                                options={DOMAIN_OPTIONS}
                                placeholder="Selecionar domínio..."
                            />
                        </Field>
                        <Field label="Perspectiva única (Domain Lens)">
                            <Input
                                value={values.domainLens}
                                onChange={e => set("domainLens", e.target.value)}
                                placeholder="Ex: Dados e evidências científicas"
                                className="h-8 text-sm"
                            />
                        </Field>
                        <Field label="Categorias aprovadas">
                            <TagInput
                                value={values.approvedCategories}
                                onChange={v => set("approvedCategories", v)}
                                placeholder="Adicionar categoria..."
                            />
                        </Field>
                    </>
                )}

                {tab === "Voz" && (
                    <>
                        <Field label="Estilo de escrita">
                            <SelectOrOther
                                value={values.writingVoiceJson.writingStyle}
                                onChange={v => set("writingVoiceJson", { ...values.writingVoiceJson, writingStyle: v })}
                                options={WRITING_STYLE_OPTIONS}
                                placeholder="Selecionar estilo..."
                            />
                        </Field>
                        <Field label="Frases características">
                            <TagInput
                                value={values.writingVoiceJson.signaturePhrases}
                                onChange={v => set("writingVoiceJson", { ...values.writingVoiceJson, signaturePhrases: v })}
                                placeholder="Adicionar frase..."
                            />
                        </Field>
                        <Field label="Opiniões marcantes">
                            <TagInput
                                value={values.writingVoiceJson.characteristicOpinions}
                                onChange={v => set("writingVoiceJson", { ...values.writingVoiceJson, characteristicOpinions: v })}
                                placeholder="Adicionar opinião..."
                            />
                        </Field>
                    </>
                )}

                {tab === "Alma" && (
                    <>
                        <Field label="Valores">
                            <TagInput value={values.soulJson.values} onChange={v => set("soulJson", { ...values.soulJson, values: v })} placeholder="Adicionar valor..." />
                        </Field>
                        <Field label="Filosofia de vida">
                            <Input value={values.soulJson.lifePhilosophy} onChange={e => set("soulJson", { ...values.soulJson, lifePhilosophy: e.target.value })} placeholder="Uma crença norteadora" className="h-8 text-sm" />
                        </Field>
                        <Field label="Estilo de humor">
                            <SelectOrOther
                                value={values.soulJson.humorStyle}
                                onChange={v => set("soulJson", { ...values.soulJson, humorStyle: v })}
                                options={HUMOR_STYLE_OPTIONS}
                                placeholder="Selecionar humor..."
                            />
                        </Field>
                        <Field label="O que emociona">
                            <TagInput value={values.soulJson.whatExcites} onChange={v => set("soulJson", { ...values.soulJson, whatExcites: v })} placeholder="Adicionar tópico..." />
                        </Field>
                        <Field label="Pet peeves (o que irrita)">
                            <TagInput value={values.soulJson.petPeeves} onChange={v => set("soulJson", { ...values.soulJson, petPeeves: v })} placeholder="Adicionar..." />
                        </Field>
                        <Field label="Opiniões fortes">
                            <TagInput value={values.soulJson.strongOpinions} onChange={v => set("soulJson", { ...values.soulJson, strongOpinions: v })} placeholder="Adicionar opinião..." />
                        </Field>
                    </>
                )}

                {tab === "EEAT" && (
                    <>
                        <Field label="Lente analítica">
                            <Input value={values.eeatSignalsJson.analyticalLens} onChange={e => set("eeatSignalsJson", { ...values.eeatSignalsJson, analyticalLens: e.target.value })} placeholder="Como analisa informações" className="h-8 text-sm" />
                        </Field>
                        <Field label="Sinais de confiança">
                            <TagInput value={values.eeatSignalsJson.trustSignals} onChange={v => set("eeatSignalsJson", { ...values.eeatSignalsJson, trustSignals: v })} placeholder="Adicionar sinal..." />
                        </Field>
                        <Field label="Claims de expertise">
                            <TagInput value={values.eeatSignalsJson.expertiseClaims} onChange={v => set("eeatSignalsJson", { ...values.eeatSignalsJson, expertiseClaims: v })} placeholder="Adicionar claim..." />
                        </Field>
                    </>
                )}

                {tab === "Forças" && (
                    <div className="space-y-3">
                        {(Object.keys(DEFAULT_PERSONA_TRAITS) as (keyof PersonaTraits)[]).map(key => (
                            <div key={key} className="space-y-0.5">
                                <div className="flex justify-between">
                                    <Label className="text-xs">{TRAIT_LABELS[key]}</Label>
                                    <span className="text-xs text-muted-foreground">{values.traitsJson[key]}/10</span>
                                </div>
                                <input
                                    type="range" min={1} max={10} step={1}
                                    value={values.traitsJson[key]}
                                    onChange={e => set("traitsJson", { ...values.traitsJson, [key]: Number(e.target.value) })}
                                    className="w-full accent-primary"
                                />
                            </div>
                        ))}
                        <PersonaRadar traits={values.traitsJson} className="mt-2" />
                    </div>
                )}

                {tab === "Avatar" && (
                    <AvatarSection
                        personaId={personaId}
                        currentUrl={values.avatarUrl ?? null}
                        onAccept={(url, params) => {
                            set("avatarUrl", url)
                            set("avatarParamsJson", params)
                        }}
                    />
                )}
            </div>

            {/* Footer */}
            <div className="border-t p-3 flex items-center justify-between gap-2 bg-background">
                {error && <p className="text-xs text-destructive flex-1">{error}</p>}
                <div className="ml-auto">
                    <Button size="sm" onClick={save} disabled={saving}>
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                        Salvar
                    </Button>
                </div>
            </div>
        </div>
    )
}
