"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { PersonaForm, type PersonaFormValues } from "@/components/personas/PersonaForm"

export default function EditPersonaPage() {
    const params = useParams()
    const id = params.id as string
    const [persona, setPersona] = useState<Partial<PersonaFormValues> | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch(`/api/personas/${id}`)
            .then(r => r.json())
            .then(({ data }) => setPersona(data))
            .finally(() => setLoading(false))
    }, [id])

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
    if (!persona) return <div className="p-6 text-sm text-muted-foreground">Persona not found.</div>

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Edit Persona</h1>
                <p className="text-sm text-muted-foreground mt-1">{persona.name}</p>
            </div>
            <PersonaForm initial={persona} personaId={id} />
        </div>
    )
}
