import { GuardrailsEditor } from '@/components/admin/GuardrailsEditor'

export default function PersonaGuardrailsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Persona Guardrails</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Global behavioral constraints applied silently to all personas. Users never see these rules.
        </p>
      </div>
      <GuardrailsEditor />
    </div>
  )
}
