'use client'
import { Link } from '@/i18n/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePinnedChannels } from '@/hooks/usePinnedChannels'

interface Props {
  channels: Array<{ id: string; name: string }>
  onSelect: (channelId: string) => void
}

export function ChannelPicker({ channels, onSelect }: Props) {
  const sorted = usePinnedChannels(channels)

  if (channels.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">You don&apos;t have any channels yet.</p>
          <Button asChild>
            <Link href="/channels">Create your first channel</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-1">
      {sorted.map((c, i) => {
        const showDivider = c.recent === false && i > 0 && sorted[i - 1].recent === true
        return (
          <div key={c.id}>
            {showDivider && (
              <div data-testid="channel-divider" className="my-2 border-t border-muted" />
            )}
            <button
              data-testid="channel-option"
              onClick={() => onSelect(c.id)}
              className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm flex items-center gap-2"
            >
              <span className={c.recent ? 'text-primary' : ''}>●</span>
              <span>{c.name}</span>
              {c.recent && (
                <span className="ml-auto text-xs text-muted-foreground">recent</span>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
