"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { PersonaForm, type PersonaFormValues } from "@/components/personas/PersonaForm"

interface Archetype {
    id: string
    slug: string
    name: string
    description: string
    defaultFieldsJson: Partial<PersonaFormValues>
}

export default function NewPersonaArchetypePage() {
    const [archetypes, setArchetypes] = useState<Archetype[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selected, setSelected] = useState<Archetype | null>(null)

    useEffect(() => {
        fetch("/api/personas/archetypes")
            .then(r => r.json())
            .then(({ data, error: apiError }) => {
                if (apiError) setError(apiError.message ?? "Failed to load archetypes")
                else setArchetypes(data ?? [])
            })
            .catch(() => setError("Failed to load archetypes"))
            .finally(() => setLoading(false))
    }, [])

    if (selected) {
        return (
            <div className="p-6 max-w-2xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-bold">Customize {selected.name}</h1>
                    <p className="text-sm text-muted-foreground mt-1">Fields pre-filled from archetype. Adjust to match your persona.</p>
                </div>
                <PersonaForm initial={selected.defaultFieldsJson} archetypeSlug={selected.slug} />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Choose an Archetype</h1>
                <p className="text-sm text-muted-foreground mt-1">Pick a starting point and customize from there.</p>
            </div>
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : error ? (
                <div className="text-center py-12 text-sm text-destructive">{error}</div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    {archetypes.map(a => (
                        <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-all" onClick={() => setSelected(a)}>
                            <CardContent className="p-4 space-y-2">
                                <p className="font-semibold text-sm">{a.name}</p>
                                <p className="text-xs text-muted-foreground">{a.description}</p>
                            </CardContent>
                        </Card>
                    ))}
                    {archetypes.length === 0 && (
                        <p className="col-span-2 text-sm text-muted-foreground text-center py-8">No archetypes defined yet.</p>
                    )}
                </div>
            )}
        </div>
    )
}
