"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Layers, MessageSquare } from "lucide-react"

const MODES = [
    {
        key: "ai",
        icon: MessageSquare,
        title: "Criar por conversa",
        description: "Conta a história da sua persona em linguagem natural. A IA faz perguntas e cria tudo automaticamente.",
        href: (locale: string) => `/${locale}/personas/new/ai`,
        badge: "Recomendado",
    },
    {
        key: "archetype",
        icon: Layers,
        title: "Começar de um arquétipo",
        description: "Escolha um modelo pré-definido e personalize a partir daí.",
        href: (locale: string) => `/${locale}/personas/new/archetype`,
        badge: null,
    },
    {
        key: "blank",
        icon: FileText,
        title: "Formulário manual",
        description: "Preencha todos os campos você mesmo. Para quem sabe exatamente o que quer.",
        href: (locale: string) => `/${locale}/personas/new/blank`,
        badge: null,
    },
]

export default function NewPersonaModePage() {
    const params = useParams()
    const locale = params.locale as string

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Nova Persona</h1>
                <p className="text-sm text-muted-foreground mt-1">Como você quer começar?</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {MODES.map((mode, i) => (
                    <Link key={mode.key} href={mode.href(locale)}>
                        <Card className={`hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer ${i === 0 ? "border-primary/40 bg-primary/5" : ""}`}>
                            <CardContent className="p-5 flex items-start gap-4">
                                <div className={`p-2.5 rounded-lg shrink-0 ${i === 0 ? "bg-primary/10" : "bg-muted"}`}>
                                    <mode.icon className={`h-5 w-5 ${i === 0 ? "text-primary" : "text-muted-foreground"}`} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-sm">{mode.title}</p>
                                        {mode.badge && (
                                            <Badge className="text-[10px] px-1.5 py-0">{mode.badge}</Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{mode.description}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    )
}
