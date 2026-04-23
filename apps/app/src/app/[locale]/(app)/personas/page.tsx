"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2, Plus } from "lucide-react"
import { PersonaCard } from "@/components/personas/PersonaCard"
import type { Persona } from "@brighttale/shared/types/agents"

export default function PersonasPage() {
    const [personas, setPersonas] = useState<Persona[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const params = useParams()
    const locale = params.locale as string

    useEffect(() => {
        fetch("/api/personas")
            .then(r => r.json())
            .then(({ data, error }) => {
                if (error) setError(error.message ?? "Failed to load personas")
                else setPersonas(data ?? [])
            })
            .catch(() => setError("Failed to load personas"))
            .finally(() => setLoading(false))
    }, [])

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Personas</h1>
                    <p className="text-sm text-muted-foreground mt-1">Your team of writing personas, assignable to any channel.</p>
                </div>
                <Button asChild>
                    <Link href={`/${locale}/personas/new`}>
                        <Plus className="h-4 w-4 mr-1" /> New Persona
                    </Link>
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : error ? (
                <div className="text-center py-12 text-sm text-destructive">{error}</div>
            ) : personas.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                    No personas yet. Create one to give your content a distinct voice.
                </div>
            ) : (
                <div className="grid gap-3">
                    {personas.map(p => <PersonaCard key={p.id} {...p} />)}
                </div>
            )}
        </div>
    )
}
