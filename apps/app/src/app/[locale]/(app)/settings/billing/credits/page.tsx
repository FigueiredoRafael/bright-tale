'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Lock, Coins } from 'lucide-react'
import type { CreditSettings } from '@/components/engines/types'
import { DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'

const OPERATIONS: { key: keyof CreditSettings; label: string }[] = [
  { key: 'costCanonicalCore', label: 'Canonical core generation' },
  { key: 'costReview', label: 'Draft review' },
]

const FORMATS: { key: keyof CreditSettings; label: string }[] = [
  { key: 'costBlog', label: 'Blog' },
  { key: 'costVideo', label: 'Video' },
  { key: 'costShorts', label: 'Shorts' },
  { key: 'costPodcast', label: 'Podcast' },
]

export default function CreditSettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<CreditSettings>(DEFAULT_CREDIT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/credit-settings')
        const json = await res.json()
        if (res.status === 403) {
          setForbidden(true)
        } else if (json?.data) {
          setSettings(json.data as CreditSettings)
        }
      } catch (err: unknown) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to load settings',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/credit-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const json = await res.json()
      if (res.status === 403) {
        setForbidden(true)
        toast({
          title: 'Forbidden',
          description: 'You do not have permission to modify credit settings',
          variant: 'destructive',
        })
      } else if (json?.error) {
        throw new Error(json.error.message)
      } else if (json?.data) {
        toast({ title: 'Saved', description: 'Credit settings updated.' })
      }
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <Lock className="h-4 w-4" />
          Restricted to administrators.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Coins className="h-6 w-6" />
          Credit Costs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Changes take effect immediately for all users.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost per operation</CardTitle>
          <CardDescription>Format-independent operations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {OPERATIONS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Input
                type="number"
                min={0}
                className="w-28 text-right"
                value={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost per format</CardTitle>
          <CardDescription>Charged on production generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FORMATS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Input
                type="number"
                min={0}
                className="w-28 text-right"
                value={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </div>
  )
}
