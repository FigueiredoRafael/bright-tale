"use client"

import { useState } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PersonaRadar } from "./PersonaRadar"
import { Globe, Lightbulb, Target, Zap, Heart, MessageSquare, Plus, X, User, Languages, ShieldAlert, BookOpen, ChevronDown, ChevronUp } from "lucide-react"
import type { Persona, PersonaTraits, PersonaLanguage } from "@brighttale/shared/types/agents"
import { computePersonaTraits, computePersonaQualityScore } from "@/components/engines/utils/personaScoring"
import type { PersonaFormValues } from "./PersonaForm"

// ─── Option lists ─────────────────────────────────────────────────────────────

const DOMAIN_OPTIONS = [
    "Finanças Pessoais", "Investimentos", "Empreendedorismo", "Marketing Digital",
    "Criação de Conteúdo", "Fitness & Saúde", "Nutrição & Bem-estar",
    "Tecnologia", "Desenvolvimento Pessoal", "E-commerce", "Carreira",
    "Relacionamentos", "Educação",
]

const WRITING_STYLE_OPTIONS = [
    "Direto e objetivo", "Analítico e detalhado", "Inspiracional e motivacional",
    "Técnico e especializado", "Conversacional e próximo", "Provocativo e questionador",
    "Educativo e didático", "Narrativo e storytelling",
]

const HUMOR_STYLE_OPTIONS = [
    "Sem humor (formal)", "Ironia sutil", "Wit seco (dry wit)",
    "Auto-depreciativo", "Referências culturais", "Absurdo / Non-sequitur",
]

const LANGUAGE_LEVEL_OPTIONS: PersonaLanguage["level"][] = ["native", "fluent", "conversational", "basic"]

const LEVEL_LABELS: Record<PersonaLanguage["level"], string> = {
    native: "Nativo",
    fluent: "Fluente",
    conversational: "Conversacional",
    basic: "Básico",
}

const TRAIT_LABELS: Record<keyof PersonaTraits, string> = {
    empatia: "Empatia", profundidade: "Profundidade", provocacao: "Provocação",
    singularidade: "Singularidade", narrativa: "Narrativa", autoridade: "Autoridade",
}

// ─── Quality thermometer ──────────────────────────────────────────────────────

function QualityThermometer({ score }: { score: number }) {
    const label = score >= 80 ? "Excelente" : score >= 60 ? "Boa" : "Persona rasa"
    const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-400" : "bg-destructive"
    const textColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-500" : "text-destructive"
    return (
        <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
            </div>
            <span className={`text-[10px] font-semibold tabular-nums whitespace-nowrap ${textColor}`}>
                {score}% {label}
            </span>
        </div>
    )
}

// ─── Inline primitives ────────────────────────────────────────────────────────

function EditText({ value, onChange, placeholder, className }: {
    value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
    return (
        <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`bg-background border border-border rounded-md px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none w-full transition-colors placeholder:text-muted-foreground/50 ${className ?? ""}`}
        />
    )
}

function EditTextarea({ value, onChange, placeholder, className }: {
    value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
    return (
        <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className={`bg-background border border-border rounded-md px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none w-full resize-none transition-colors placeholder:text-muted-foreground/50 ${className ?? ""}`}
        />
    )
}

function EditSelect({ value, onChange, options, placeholder }: {
    value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
    const isKnown = options.includes(value)
    return (
        <div className="space-y-1">
            <Select value={isKnown ? value : "__custom__"} onValueChange={v => v !== "__custom__" && onChange(v)}>
                <SelectTrigger className="h-8 text-sm border-border bg-background">
                    <SelectValue placeholder={placeholder ?? "Selecionar..."} />
                </SelectTrigger>
                <SelectContent>
                    {options.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                    <SelectItem value="__custom__" className="text-xs text-muted-foreground">Personalizado</SelectItem>
                </SelectContent>
            </Select>
            {!isKnown && value && (
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    rows={2}
                    className="bg-background border border-border rounded-md px-2 py-1 text-sm focus:border-primary focus:outline-none w-full mt-1 resize-none transition-colors"
                />
            )}
        </div>
    )
}

function EditTags({ value, onChange, placeholder }: {
    value: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
    const [input, setInput] = useState("")
    function add() {
        const t = input.trim()
        if (t && !value.includes(t)) onChange([...value, t])
        setInput("")
    }
    return (
        <div className="flex flex-wrap gap-1 items-center">
            {value.map(tag => (
                <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-muted/80 rounded-full text-[10px] group">
                    {tag}
                    <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity">
                        <X className="h-2.5 w-2.5" />
                    </button>
                </span>
            ))}
            <div className="flex items-center gap-1">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
                    placeholder={placeholder ?? "Adicionar..."}
                    className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] w-24 focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                />
                <button type="button" onClick={add} className="text-muted-foreground hover:text-primary">
                    <Plus className="h-3 w-3" />
                </button>
            </div>
        </div>
    )
}

const BIO_PREVIEW_CHARS = 300

function BioLongSection({ editing, value, display, onChange }: {
    editing: boolean
    value: string
    display: string
    onChange: (v: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const wordCount = display.trim().split(/\s+/).filter(Boolean).length
    const needsToggle = display.length > BIO_PREVIEW_CHARS

    return (
        <div className="sm:col-span-2">
            <SectionTitle icon={BookOpen} label="Biografia" />
            {editing ? (
                <EditTextarea
                    value={value}
                    onChange={onChange}
                    placeholder="História de vida detalhada (~800 palavras)..."
                    className="text-sm min-h-[160px]"
                />
            ) : (
                <div>
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                        {needsToggle && !expanded
                            ? display.slice(0, BIO_PREVIEW_CHARS).trimEnd() + "…"
                            : display}
                    </p>
                    {needsToggle && (
                        <button
                            onClick={() => setExpanded(e => !e)}
                            className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                            {expanded
                                ? <><ChevronUp className="h-3 w-3" /> Ver menos</>
                                : <><ChevronDown className="h-3 w-3" /> Ver mais ({wordCount} palavras)</>}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{children}</p>
}

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <div className="flex items-center gap-1.5 mb-2">
            <Icon className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
    )
}

function BulletList({ items }: { items: string[] }) {
    if (!items.length) return <p className="text-xs text-muted-foreground italic">—</p>
    return (
        <ul className="space-y-1">
            {items.slice(0, 5).map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
                    {item}
                </li>
            ))}
        </ul>
    )
}

// ─── Languages editor ─────────────────────────────────────────────────────────

function LanguagesEditor({ value, onChange }: {
    value: PersonaLanguage[]; onChange: (v: PersonaLanguage[]) => void
}) {
    const [lang, setLang] = useState("")
    const [level, setLevel] = useState<PersonaLanguage["level"]>("fluent")
    function add() {
        const t = lang.trim()
        if (t && !value.find(l => l.language.toLowerCase() === t.toLowerCase())) {
            onChange([...value, { language: t, level }])
        }
        setLang("")
    }
    return (
        <div className="space-y-1.5">
            {value.map((l, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs group">
                    <span className="font-medium">{l.language}</span>
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">{LEVEL_LABELS[l.level]}</Badge>
                    <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity ml-auto">
                        <X className="h-2.5 w-2.5" />
                    </button>
                </div>
            ))}
            <div className="flex gap-1 items-center">
                <input
                    value={lang}
                    onChange={e => setLang(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
                    placeholder="Idioma..."
                    className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] w-24 focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                />
                <Select value={level} onValueChange={v => setLevel(v as PersonaLanguage["level"])}>
                    <SelectTrigger className="h-6 text-[11px] w-32 border-border bg-background">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LANGUAGE_LEVEL_OPTIONS.map(l => (
                            <SelectItem key={l} value={l} className="text-xs">{LEVEL_LABELS[l]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <button type="button" onClick={add} className="text-muted-foreground hover:text-primary">
                    <Plus className="h-3 w-3" />
                </button>
            </div>
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PersonaProfileCardProps {
    persona: Persona
    editing?: boolean
    values?: PersonaFormValues
    onChange?: (v: PersonaFormValues) => void
    qualityScore?: number
}

export function PersonaProfileCard({ persona, editing = false, values, onChange, qualityScore }: PersonaProfileCardProps) {
    const v = values ?? {
        name: persona.name, slug: persona.slug,
        bioShort: persona.bioShort, bioLong: persona.bioLong,
        primaryDomain: persona.primaryDomain, domainLens: persona.domainLens,
        approvedCategories: persona.approvedCategories,
        nationality: persona.nationality ?? "",
        age: persona.age ?? undefined,
        gender: persona.gender ?? "",
        languagesJson: persona.languagesJson ?? [],
        traitsJson: persona.traitsJson,
        writingVoiceJson: persona.writingVoiceJson,
        eeatSignalsJson: persona.eeatSignalsJson,
        soulJson: persona.soulJson,
        archetypeSlug: persona.archetypeSlug,
        avatarUrl: persona.avatarUrl,
        avatarParamsJson: persona.avatarParamsJson,
        wpAuthorId: persona.wpAuthorId,
    }

    function upd<K extends keyof PersonaFormValues>(key: K, val: PersonaFormValues[K]) {
        onChange?.({ ...v, [key]: val })
    }

    const computedTraits = computePersonaTraits(editing ? { ...persona, ...v } as Persona : persona)
    const score = qualityScore ?? computePersonaQualityScore(editing ? { ...persona, ...v } as Persona : persona)

    return (
        <div className={`rounded-2xl border bg-card overflow-hidden shadow-sm ${!persona.isActive ? "opacity-60" : ""}`}>
            <div className="h-1.5 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />

            <div className="p-5 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">

                {/* ─── Left column ─────────────────────────────────── */}
                <div className="space-y-4">
                    {/* Avatar + identity */}
                    <div className="flex flex-col gap-2">
                        <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-muted shadow-sm">
                            {v.avatarUrl ? (
                                <Image src={v.avatarUrl} alt={v.name} fill sizes="(max-width: 768px) 100vw, 25vw" className="object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <span className="text-4xl font-bold text-muted-foreground select-none">
                                        {v.name.slice(0, 2).toUpperCase()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {editing ? (
                            <div>
                                <FieldLabel>Nome</FieldLabel>
                                <EditText value={v.name} onChange={val => upd("name", val)} placeholder="Nome da persona" className="font-semibold" />
                            </div>
                        ) : (
                            <h2 className="font-bold text-base leading-tight text-center">{persona.name}</h2>
                        )}

                        {editing ? (
                            <div>
                                <FieldLabel>Domínio principal</FieldLabel>
                                <EditSelect value={v.primaryDomain} onChange={val => upd("primaryDomain", val)} options={DOMAIN_OPTIONS} placeholder="Selecionar domínio..." />
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 justify-center">
                                <Globe className="h-3 w-3 text-primary" />
                                <p className="text-xs text-primary font-medium">{persona.primaryDomain}</p>
                            </div>
                        )}

                        {editing ? (
                            <div>
                                <FieldLabel>Perspectiva única</FieldLabel>
                                <EditTextarea value={v.domainLens} onChange={val => upd("domainLens", val)} placeholder="Ex: Dados e evidências científicas..." />
                            </div>
                        ) : (
                            persona.domainLens && (
                                <p className="text-[11px] text-muted-foreground italic leading-snug text-center">{persona.domainLens}</p>
                            )
                        )}
                    </div>

                    {/* Quality score */}
                    <div>
                        <FieldLabel>Qualidade</FieldLabel>
                        <QualityThermometer score={score} />
                    </div>

                    {/* Demographics */}
                    <div>
                        <SectionTitle icon={User} label="Identidade" />
                        {editing ? (
                            <div className="space-y-2">
                                <div>
                                    <FieldLabel>Nacionalidade</FieldLabel>
                                    <EditText value={v.nationality ?? ""} onChange={val => upd("nationality", val)} placeholder="Ex: Brasileira, Americana..." />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <FieldLabel>Idade</FieldLabel>
                                        <input
                                            type="number" min={1} max={120}
                                            value={v.age ?? ""}
                                            onChange={e => upd("age", e.target.value ? Number(e.target.value) : undefined)}
                                            placeholder="Ex: 35"
                                            className="bg-background border border-border rounded-md px-2 py-1 text-sm focus:border-primary focus:outline-none w-full transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel>Gênero</FieldLabel>
                                        <EditText value={v.gender ?? ""} onChange={val => upd("gender", val)} placeholder="Ex: Feminino..." />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                                {persona.nationality && <span>{persona.nationality}</span>}
                                {persona.age && <span>• {persona.age} anos</span>}
                                {persona.gender && <span>• {persona.gender}</span>}
                                {!persona.nationality && !persona.age && !persona.gender && <span className="italic">—</span>}
                            </div>
                        )}
                    </div>

                    {/* Languages */}
                    <div>
                        <SectionTitle icon={Languages} label="Idiomas" />
                        {editing ? (
                            <LanguagesEditor
                                value={v.languagesJson ?? []}
                                onChange={val => upd("languagesJson", val)}
                            />
                        ) : (
                            <div className="space-y-1">
                                {(persona.languagesJson ?? []).length === 0
                                    ? <p className="text-xs text-muted-foreground italic">—</p>
                                    : (persona.languagesJson ?? []).map((l, i) => (
                                        <div key={i} className="flex items-center gap-1.5 text-xs">
                                            <span className="font-medium">{l.language}</span>
                                            <Badge variant="secondary" className="text-[9px] px-1 py-0">{LEVEL_LABELS[l.level]}</Badge>
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                    </div>

                    {/* Categories */}
                    <div>
                        <FieldLabel>Categorias aprovadas</FieldLabel>
                        {editing ? (
                            <EditTags value={v.approvedCategories} onChange={val => upd("approvedCategories", val)} placeholder="categoria..." />
                        ) : (
                            <div className="flex flex-wrap gap-1">
                                {persona.approvedCategories.slice(0, 6).map(c => (
                                    <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0 max-w-full truncate">{c}</Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Soul values */}
                    <div>
                        <FieldLabel>Valores</FieldLabel>
                        {editing ? (
                            <EditTags
                                value={v.soulJson.values}
                                onChange={val => upd("soulJson", { ...v.soulJson, values: val })}
                                placeholder="valor..."
                            />
                        ) : (
                            <ul className="space-y-1">
                                {persona.soulJson.values.slice(0, 4).map(val => (
                                    <li key={val} className="flex items-start gap-1.5">
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                                        <span className="text-[11px] text-foreground leading-snug line-clamp-2">{val}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Life philosophy */}
                    {(editing || persona.soulJson.lifePhilosophy) && (
                        <div className={editing ? "" : "rounded-lg border border-dashed p-2.5 text-center"}>
                            {editing ? (
                                <div>
                                    <FieldLabel>Filosofia de vida</FieldLabel>
                                    <EditTextarea
                                        value={v.soulJson.lifePhilosophy}
                                        onChange={val => upd("soulJson", { ...v.soulJson, lifePhilosophy: val })}
                                        placeholder="Uma crença norteadora..."
                                    />
                                </div>
                            ) : (
                                <p className="text-[11px] text-muted-foreground italic">"{persona.soulJson.lifePhilosophy}"</p>
                            )}
                        </div>
                    )}
                </div>

                {/* ─── Right column ─────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 content-start">
                    {/* Bio curta */}
                    <div className="sm:col-span-2">
                        <SectionTitle icon={Globe} label="Sobre" />
                        {editing ? (
                            <EditTextarea
                                value={v.bioShort}
                                onChange={val => upd("bioShort", val)}
                                placeholder="Bio curta..."
                                className="text-sm"
                            />
                        ) : (
                            <p className="text-sm leading-relaxed">{persona.bioShort}</p>
                        )}
                    </div>

                    {/* Biografia detalhada */}
                    {(editing || persona.bioLong) && (
                        <BioLongSection
                            editing={editing}
                            value={v.bioLong}
                            display={persona.bioLong}
                            onChange={val => upd("bioLong", val)}
                        />
                    )}

                    {/* Motivações */}
                    <div>
                        <SectionTitle icon={Zap} label="Motivações" />
                        {editing ? (
                            <EditTags
                                value={v.soulJson.whatExcites}
                                onChange={val => upd("soulJson", { ...v.soulJson, whatExcites: val })}
                                placeholder="motivação..."
                            />
                        ) : (
                            <BulletList items={persona.soulJson.whatExcites} />
                        )}
                    </div>

                    {/* Opiniões Fortes */}
                    <div>
                        <SectionTitle icon={Target} label="Opiniões Fortes" />
                        {editing ? (
                            <EditTags
                                value={v.soulJson.strongOpinions}
                                onChange={val => upd("soulJson", { ...v.soulJson, strongOpinions: val })}
                                placeholder="opinião..."
                            />
                        ) : (
                            <BulletList items={persona.soulJson.strongOpinions} />
                        )}
                    </div>

                    {/* Dores */}
                    <div>
                        <SectionTitle icon={Heart} label="Dores" />
                        {editing ? (
                            <EditTags
                                value={v.soulJson.petPeeves}
                                onChange={val => upd("soulJson", { ...v.soulJson, petPeeves: val })}
                                placeholder="dor..."
                            />
                        ) : (
                            <BulletList items={persona.soulJson.petPeeves} />
                        )}
                    </div>

                    {/* Estilo de escrita */}
                    <div>
                        <SectionTitle icon={MessageSquare} label="Estilo de Escrita" />
                        {editing ? (
                            <>
                                <EditSelect
                                    value={v.writingVoiceJson.writingStyle}
                                    onChange={val => upd("writingVoiceJson", { ...v.writingVoiceJson, writingStyle: val })}
                                    options={WRITING_STYLE_OPTIONS}
                                    placeholder="Selecionar estilo..."
                                />
                                <div className="mt-2">
                                    <p className="text-[10px] text-muted-foreground mb-1">Frases características</p>
                                    <EditTags
                                        value={v.writingVoiceJson.signaturePhrases}
                                        onChange={val => upd("writingVoiceJson", { ...v.writingVoiceJson, signaturePhrases: val })}
                                        placeholder="frase..."
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-xs">{persona.writingVoiceJson.writingStyle}</p>
                                {persona.writingVoiceJson.signaturePhrases.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {persona.writingVoiceJson.signaturePhrases.slice(0, 3).map(p => (
                                            <span key={p} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full italic">"{p}"</span>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Humor style */}
                    <div>
                        <SectionTitle icon={MessageSquare} label="Humor" />
                        {editing ? (
                            <EditSelect
                                value={v.soulJson.humorStyle}
                                onChange={val => upd("soulJson", { ...v.soulJson, humorStyle: val })}
                                options={HUMOR_STYLE_OPTIONS}
                                placeholder="Estilo de humor..."
                            />
                        ) : (
                            <p className="text-xs leading-relaxed">{persona.soulJson.humorStyle || "—"}</p>
                        )}
                    </div>

                    {/* Guardrails */}
                    <div className="sm:col-span-2">
                        <SectionTitle icon={ShieldAlert} label="Guardrails — o que nunca faz" />
                        {editing ? (
                            <EditTags
                                value={v.soulJson.languageGuardrails}
                                onChange={val => upd("soulJson", { ...v.soulJson, languageGuardrails: val })}
                                placeholder="ex: nunca use 'jornada'..."
                            />
                        ) : (
                            <div className="flex flex-wrap gap-1">
                                {(persona.soulJson.languageGuardrails ?? []).length === 0
                                    ? <p className="text-xs text-muted-foreground italic">Nenhum guardrail definido — o output pode parecer genérico.</p>
                                    : persona.soulJson.languageGuardrails.slice(0, 6).map(g => (
                                        <Badge key={g} variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">{g}</Badge>
                                    ))
                                }
                            </div>
                        )}
                    </div>

                    {/* Autoridade / EEAT */}
                    {(editing || persona.eeatSignalsJson.trustSignals.length > 0) && (
                        <div className="sm:col-span-2">
                            <SectionTitle icon={Lightbulb} label="Autoridade" />
                            {editing ? (
                                <div className="space-y-3">
                                    <div>
                                        <FieldLabel>Sinais de confiança</FieldLabel>
                                        <EditTags
                                            value={v.eeatSignalsJson.trustSignals}
                                            onChange={val => upd("eeatSignalsJson", { ...v.eeatSignalsJson, trustSignals: val })}
                                            placeholder="sinal..."
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel>Lente analítica</FieldLabel>
                                        <EditTextarea
                                            value={v.eeatSignalsJson.analyticalLens}
                                            onChange={val => upd("eeatSignalsJson", { ...v.eeatSignalsJson, analyticalLens: val })}
                                            placeholder="Como analisa e enquadra informações..."
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1">
                                        {persona.eeatSignalsJson.trustSignals.slice(0, 5).map(s => (
                                            <Badge key={s} className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary hover:bg-primary/10 border-0">{s}</Badge>
                                        ))}
                                    </div>
                                    {persona.eeatSignalsJson.analyticalLens && (
                                        <p className="text-xs text-muted-foreground leading-relaxed">{persona.eeatSignalsJson.analyticalLens}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── FORÇAS (computed) ── */}
                    <div className="sm:col-span-2 pt-4 border-t">
                        <SectionTitle icon={Zap} label="Forças" />
                        <p className="text-[10px] text-muted-foreground mb-3">Calculado automaticamente a partir do perfil.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                                {(Object.keys(TRAIT_LABELS) as (keyof PersonaTraits)[]).map(key => (
                                    <div key={key} className="space-y-0.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-muted-foreground">{TRAIT_LABELS[key]}</span>
                                            <span className="text-[10px] font-semibold tabular-nums">{computedTraits[key]}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-primary transition-all"
                                                style={{ width: `${(computedTraits[key] / 10) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <PersonaRadar traits={computedTraits} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
