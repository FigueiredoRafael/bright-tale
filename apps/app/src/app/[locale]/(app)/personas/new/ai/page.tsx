"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChatWizard } from "@/components/chat/ChatWizard"
import { PersonaProfileCard } from "@/components/personas/PersonaProfileCard"
import { PersonaForm, type PersonaFormValues } from "@/components/personas/PersonaForm"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Edit, Check } from "lucide-react"
import type { Persona } from "@brighttale/shared/types/agents"
import { DEFAULT_PERSONA_TRAITS } from "@brighttale/shared/types/agents"
import Link from "next/link"

type Step = "chat" | "preview" | "form"

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

export default function NewPersonaAiPage() {
    const params = useParams()
    const locale = params.locale as string
    const router = useRouter()

    const [step, setStep] = useState<Step>("chat")
    const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null)

    function handleChatComplete(data: Record<string, unknown>) {
        setExtracted(data)
        setStep("preview")
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
                <PersonaForm initial={extracted as Partial<PersonaFormValues>} />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-4">
            <div className="flex items-center gap-3">
                <Link href={`/${locale}/personas/new`} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Criar Persona</h1>
                    <p className="text-sm text-muted-foreground">Converse com a IA e ela cria tudo automaticamente.</p>
                </div>
            </div>

            <div className="border rounded-2xl overflow-hidden bg-card" style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>
                <ChatWizard<Record<string, unknown>>
                    moduleId="persona_wizard"
                    onComplete={handleChatComplete}
                    placeholder="Conta quem é a sua persona..."
                />
            </div>
        </div>
    )
}
