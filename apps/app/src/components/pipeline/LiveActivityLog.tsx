'use client'
import { Card, CardContent } from '@/components/ui/card'

export interface ActivityEntry { timestamp: string; text: string }

export function LiveActivityLog({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null
  return (
    <Card data-testid="live-activity-log" className="mt-4">
      <CardContent className="py-3 px-4 space-y-1">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Activity</h4>
        {entries.slice(-5).reverse().map((e, i) => (
          <p key={i} className="text-xs"><span className="text-muted-foreground mr-2">{new Date(e.timestamp).toLocaleTimeString()}</span>{e.text}</p>
        ))}
      </CardContent>
    </Card>
  )
}
