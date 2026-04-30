'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChannelPicker } from '@/components/projects/ChannelPicker'

type Channel = { id: string; name: string }

export default function NewProjectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deepLinkChannelId = searchParams.get('channelId')
  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/channels')
      const json = await res.json()
      setChannels((json?.data?.channels ?? []) as Channel[])
    })()
  }, [])

  // Auto-create when deep link supplied or only one channel exists
  useEffect(() => {
    if (creating) return
    if (deepLinkChannelId) {
      void createProject(deepLinkChannelId)
    } else if (channels !== null && channels.length === 1) {
      void createProject(channels[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, deepLinkChannelId])

  async function createProject(channelId: string) {
    setCreating(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId,
        title: 'New Project',
        current_stage: 'brainstorm',
        status: 'active',
        winner: false,
      }),
    })
    const json = await res.json()
    const id = json?.data?.id
    if (id) {
      router.push(`/projects/${id}`)
    } else {
      setCreating(false)
    }
  }

  if (channels === null) {
    return <p className="p-6 text-sm text-muted-foreground">Loading...</p>
  }

  // Auto-creating (single channel or deep link) — render nothing while redirecting
  if (creating) {
    return <p className="p-6 text-sm text-muted-foreground">Loading...</p>
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Start a new project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Pick a channel</p>
          <ChannelPicker channels={channels} onSelect={setSelectedId} />
          <Button
            disabled={!selectedId || creating}
            onClick={() => selectedId && void createProject(selectedId)}
          >
            {creating ? 'Creating...' : 'Continue'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
