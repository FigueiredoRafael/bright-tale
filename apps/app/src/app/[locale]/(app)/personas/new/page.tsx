"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { FileText, Layers, Sparkles } from "lucide-react"

const MODES = [
    {
        key: "blank",
        icon: FileText,
        title: "Blank Slate",
        description: "Start from scratch and fill every field manually.",
        href: (locale: string) => `/${locale}/personas/new/blank`,
    },
    {
        key: "archetype",
        icon: Layers,
        title: "Start from Archetype",
        description: "Pick a platform-defined type and customize from there.",
        href: (locale: string) => `/${locale}/personas/new/archetype`,
    },
    {
        key: "ai",
        icon: Sparkles,
        title: "AI Generation",
        description: "Describe your persona in plain language. AI extracts the fields.",
        href: (locale: string) => `/${locale}/personas/new/ai`,
    },
]

export default function NewPersonaModePage() {
    const params = useParams()
    const locale = params.locale as string

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Create a Persona</h1>
                <p className="text-sm text-muted-foreground mt-1">Choose how you want to start.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {MODES.map(mode => (
                    <Link key={mode.key} href={mode.href(locale)}>
                        <Card className="h-full hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer">
                            <CardContent className="p-5 space-y-3">
                                <mode.icon className="h-7 w-7 text-primary" />
                                <div>
                                    <p className="font-semibold text-sm">{mode.title}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{mode.description}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    )
}
