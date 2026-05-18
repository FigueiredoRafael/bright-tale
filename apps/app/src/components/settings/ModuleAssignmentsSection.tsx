"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, Trash2, Cpu } from "lucide-react"
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker"
import { MODULE_LABELS, type ModuleSlug } from "@brighttale/shared/schemas/module-ai-assignments"
import type { ModuleAiAssignment } from "@brighttale/shared/schemas/module-ai-assignments"

const ALL_MODULES = Object.keys(MODULE_LABELS) as ModuleSlug[]

interface ModuleRowProps {
  moduleSlug: ModuleSlug
  current: ModuleAiAssignment | undefined
  onSaved: (a: ModuleAiAssignment) => void
  onDeleted: (slug: ModuleSlug) => void
}

function ModuleRow({ moduleSlug, current, onSaved, onDeleted }: ModuleRowProps) {
  const [editing, setEditing] = useState(false)
  const [provider, setProvider] = useState<ProviderId>((current?.provider as ProviderId) ?? "gemini")
  const [model, setModel] = useState<string>(current?.model ?? MODELS_BY_PROVIDER.gemini[0].id)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/ai-providers/module-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleSlug, provider, model }),
      })
      const { data, error } = await res.json()
      if (!error && data) { onSaved(data); setEditing(false) }
    } finally { setSaving(false) }
  }

  async function remove() {
    setDeleting(true)
    try {
      await fetch(`/api/ai-providers/module-assignments/${moduleSlug}`, { method: "DELETE" })
      onDeleted(moduleSlug)
      setEditing(false)
    } finally { setDeleting(false) }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{MODULE_LABELS[moduleSlug]}</span>
          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{moduleSlug}</code>
        </div>
        <div className="flex items-center gap-2">
          {current
            ? <Badge variant="secondary" className="text-[10px]">{current.provider} · {current.model}</Badge>
            : <Badge variant="outline" className="text-[10px] text-muted-foreground">padrão global</Badge>
          }
          <Button size="sm" variant="outline" onClick={() => setEditing(!editing)} className="h-7 text-xs px-2">
            {editing ? "Cancelar" : "Configurar"}
          </Button>
        </div>
      </div>

      {editing && (
        <div className="space-y-3 pt-1 border-t">
          <ModelPicker
            provider={provider}
            model={model}
            onProviderChange={p => { setProvider(p); setModel(MODELS_BY_PROVIDER[p][0].id) }}
            onModelChange={setModel}
          />
          <div className="flex justify-between">
            {current && (
              <Button size="sm" variant="destructive" onClick={remove} disabled={deleting} className="h-7 text-xs">
                {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Remover override
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs ml-auto">
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ModuleAssignmentsSection() {
  const [assignments, setAssignments] = useState<ModuleAiAssignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/ai-providers/module-assignments")
      .then(r => r.json())
      .then(({ data }) => { if (data) setAssignments(data) })
      .finally(() => setLoading(false))
  }, [])

  function handleSaved(a: ModuleAiAssignment) {
    setAssignments(prev => {
      const without = prev.filter(x => x.moduleSlug !== a.moduleSlug)
      return [...without, a]
    })
  }

  function handleDeleted(slug: ModuleSlug) {
    setAssignments(prev => prev.filter(x => x.moduleSlug !== slug))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">IA por Módulo</CardTitle>
        <CardDescription className="text-xs">
          Configure qual provider e modelo cada módulo usa. Sem configuração, usa o provider global ativo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          ALL_MODULES.map(slug => (
            <ModuleRow
              key={slug}
              moduleSlug={slug}
              current={assignments.find(a => a.moduleSlug === slug)}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}
