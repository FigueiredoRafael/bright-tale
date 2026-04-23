"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Sparkles } from "lucide-react"
import { PersonaForm, type PersonaFormValues } from "@/components/personas/PersonaForm"

export default function NewPersonaAiPage() {
    const [description, setDescription] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [extracted, setExtracted] = useState<Partial<PersonaFormValues> | null>(null)

    async function handleExtract() {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/personas/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description }),
            })
            const { data, error: apiError } = await res.json()
            if (apiError) {
                setError(apiError.message ?? "Failed to extract persona")
                return
            }
            if (data) setExtracted(data)
        } catch {
            setError("Failed to extract persona")
        } finally {
            setLoading(false)
        }
    }

    if (extracted) {
        return (
            <div className="p-6 max-w-2xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-bold">Review Generated Persona</h1>
                    <p className="text-sm text-muted-foreground mt-1">AI extracted these fields. Review and adjust before saving.</p>
                </div>
                <PersonaForm initial={extracted} />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Describe Your Persona</h1>
                <p className="text-sm text-muted-foreground mt-1">Write freely. AI will extract the structured fields.</p>
            </div>
            <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="A no-nonsense fitness coach who's been competing for 15 years, very direct, hates pseudoscience, speaks in short punchy sentences..."
                className="min-h-[160px]"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={handleExtract} disabled={loading || description.length < 10} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Extract Persona Fields
            </Button>
        </div>
    )
}
