import { ArchetypesManager } from '@/components/admin/ArchetypesManager'

export default function PersonaArchetypesPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Persona Archetypes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform-defined starting points for persona creation. Default fields are shown to users; behavioral overlays are hidden.
        </p>
      </div>
      <ArchetypesManager />
    </div>
  )
}
