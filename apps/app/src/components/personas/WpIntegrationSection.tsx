"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Link2, UserPlus } from "lucide-react"

interface WpIntegrationSectionProps {
    personaId: string
    currentWpAuthorId: number | null
    channelId?: string
}

export function WpIntegrationSection({ personaId, currentWpAuthorId, channelId }: WpIntegrationSectionProps) {
    const [mode, setMode] = useState<"link" | "create">("link")
    const [wpUsername, setWpUsername] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<number | null>(currentWpAuthorId)

    async function handleSubmit() {
        if (!channelId) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/personas/${personaId}/integrations/wordpress`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: mode, wpUsername: mode === "link" ? wpUsername : undefined, channelId }),
            })
            const { data, error: apiError } = await res.json()
            if (apiError) {
                setError(apiError.message ?? "Failed to link WordPress author")
                return
            }
            if (data?.wpAuthorId) setResult(data.wpAuthorId)
            else setError("Unexpected response from server")
        } catch {
            setError("Failed to link WordPress author")
        } finally {
            setLoading(false)
        }
    }

    if (result) {
        return (
            <div className="flex items-center gap-2 text-sm text-green-600">
                <Link2 className="h-4 w-4" />
                WordPress author linked (ID: {result})
            </div>
        )
    }

    if (!channelId) {
        return <p className="text-xs text-muted-foreground">Assign persona to a channel first to connect WordPress.</p>
    }

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <Button type="button" size="sm" variant={mode === "link" ? "default" : "outline"} onClick={() => setMode("link")}>
                    <Link2 className="h-3 w-3 mr-1" /> Link existing
                </Button>
                <Button type="button" size="sm" variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>
                    <UserPlus className="h-3 w-3 mr-1" /> Create new
                </Button>
            </div>

            {mode === "link" && (
                <div className="space-y-1">
                    <Label className="text-xs">WordPress Username</Label>
                    <Input value={wpUsername} onChange={e => setWpUsername(e.target.value)} placeholder="wp-username" className="h-8" />
                </div>
            )}

            {mode === "create" && (
                <p className="text-xs text-muted-foreground">A new WordPress author will be created using this persona's name and slug.</p>
            )}

            <Button type="button" size="sm" onClick={handleSubmit} disabled={loading || !channelId || (mode === "link" && !wpUsername)}>
                {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {mode === "link" ? "Link Author" : "Create WP Author"}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    )
}
