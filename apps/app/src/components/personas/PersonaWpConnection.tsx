"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { WpIntegrationSection } from "./WpIntegrationSection"

interface PersonaWpConnectionProps {
    personaId: string
    currentWpAuthorId: number | null
}

interface ChannelOption {
    id: string
    name: string
    has_wordpress: boolean
}

// PersonaWpConnection — shared WordPress-linking surface for a persona.
// Fetches the user's channels, gates on whether any has WordPress configured,
// renders a channel selector, and delegates the actual link/create/unlink to
// WpIntegrationSection. Used by both PersonaForm (creation) and the persona
// detail/management view so the two surfaces stay in sync.
export function PersonaWpConnection({ personaId, currentWpAuthorId }: PersonaWpConnectionProps) {
    const [channels, setChannels] = useState<ChannelOption[]>([])
    const [rawChannelCount, setRawChannelCount] = useState(0)
    const [selectedChannelId, setSelectedChannelId] = useState<string>("")
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!personaId) return
        let cancelled = false
        fetch("/api/channels")
            .then(r => r.json())
            .then(({ data }) => {
                if (cancelled) return
                const items = (data?.items ?? []) as ChannelOption[]
                setRawChannelCount(items.length)
                const wpConfigured = items.filter(c => c.has_wordpress === true)
                setChannels(wpConfigured)
                if (wpConfigured.length) setSelectedChannelId(prev => prev || wpConfigured[0].id)
            })
            .catch(() => { /* channel list is optional — silently skip if it fails */ })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [personaId])

    if (loading) {
        return (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading channels…
            </p>
        )
    }
    if (rawChannelCount === 0) {
        return <p className="text-xs text-muted-foreground">Create a content channel first to connect WordPress.</p>
    }
    if (channels.length === 0) {
        return <p className="text-xs text-muted-foreground">None of your channels have WordPress configured. Add a WordPress config in Channel → Settings → WordPress first.</p>
    }

    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <Label className="text-xs">Channel</Label>
                <select
                    value={selectedChannelId}
                    onChange={e => setSelectedChannelId(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border bg-background"
                >
                    {channels.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <p className="text-[10px] text-muted-foreground">Which channel&apos;s WordPress site to link against.</p>
            </div>
            <WpIntegrationSection
                personaId={personaId}
                currentWpAuthorId={currentWpAuthorId}
                channelId={selectedChannelId}
            />
        </div>
    )
}
