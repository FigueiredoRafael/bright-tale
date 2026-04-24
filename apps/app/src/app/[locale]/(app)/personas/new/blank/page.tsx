import { PersonaForm } from "@/components/personas/PersonaForm"

export default function NewPersonaBlankPage() {
    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">New Persona</h1>
                <p className="text-sm text-muted-foreground mt-1">Fill in the details to define your persona.</p>
            </div>
            <PersonaForm />
        </div>
    )
}
