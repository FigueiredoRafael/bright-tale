'use client'

import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

interface Channel {
  id: string
  name: string
}

interface ChannelsApiResponse {
  data: {
    items: Channel[]
    total: number | null
    page: number
    limit: number
  } | null
  error: { code: string; message: string } | null
}

interface ProjectPatchResponse {
  data: unknown
  error: { code: string; message: string } | null
}

interface Props {
  projectId: string
  channelId: string | null
  onPicked: (channelId: string) => void
}

export function PickChannelModal({ projectId, channelId, onPicked }: Props) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (channelId !== null) return

    let cancelled = false

    async function loadChannels() {
      setLoading(true)
      setFetchError(null)
      try {
        const res = await fetch('/api/channels')
        const json: ChannelsApiResponse = await res.json()
        if (cancelled) return
        if (json.error) {
          setFetchError(json.error.message)
          return
        }
        const items = json.data?.items ?? []
        setChannels(items)
        if (items.length > 0) {
          setSelectedChannelId(items[0].id)
        }
      } catch {
        if (!cancelled) {
          setFetchError('Failed to load channels. Please try again.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadChannels()
    return () => {
      cancelled = true
    }
  }, [channelId])

  if (channelId !== null) {
    return null
  }

  async function handleSubmit() {
    if (selectedChannelId === null) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannelId }),
      })
      const json: ProjectPatchResponse = await res.json()
      if (json.error) {
        setSubmitError(json.error.message)
        return
      }
      onPicked(selectedChannelId)
    } catch {
      setSubmitError('Failed to assign channel. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open>
      <AlertDialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Assign a Channel</AlertDialogTitle>
          <AlertDialogDescription>
            This project needs to be linked to a channel before you can continue. Select a channel
            below. This step cannot be skipped.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          {loading && <p className="text-sm text-muted-foreground">Loading channels…</p>}

          {fetchError !== null && (
            <p className="text-sm text-destructive" role="alert">
              {fetchError}
            </p>
          )}

          {!loading && fetchError === null && channels.length === 0 && (
            <p className="text-sm text-muted-foreground">No channels found.</p>
          )}

          {!loading && fetchError === null && channels.length > 0 && (
            <ul className="space-y-2" role="listbox" aria-label="Channels">
              {channels.map((ch) => (
                <li
                  key={ch.id}
                  role="option"
                  aria-selected={selectedChannelId === ch.id}
                  className={`cursor-pointer rounded-md border px-4 py-2 text-sm transition-colors ${
                    selectedChannelId === ch.id
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-border hover:bg-accent'
                  }`}
                  onClick={() => setSelectedChannelId(ch.id)}
                >
                  {ch.name}
                </li>
              ))}
            </ul>
          )}

          {submitError !== null && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => void handleSubmit()}
            disabled={selectedChannelId === null || submitting || loading}
          >
            {submitting ? 'Saving…' : 'Confirm Channel'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
