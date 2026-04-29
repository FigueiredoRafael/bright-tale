"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Link2, UserPlus, Unlink } from "lucide-react"

interface WpIntegrationSectionProps {
    personaId: string
    currentWpAuthorId: number | null
    channelId?: string
}

interface ApiError {
    code: string
    message: string
}

const WP_ERROR_MESSAGES: Record<string, string> = {
    NO_WP_CONFIG: "This channel has no WordPress site configured. Configure it in Channel → Settings → WordPress first.",
    WP_CONFIG_NOT_FOUND: "WordPress config missing. Re-link WordPress in Channel → Settings.",
    WP_USER_NOT_FOUND: "No WordPress user matches that username on this site.",
    WP_FETCH_ERROR: "Could not reach WordPress. Check the site URL in Channel → Settings.",
}

function getErrorMessage(error: ApiError): string {
    if (error.code in WP_ERROR_MESSAGES) {
        return WP_ERROR_MESSAGES[error.code]
    }
    return error.message ?? "Failed to link WordPress author"
}

export function WpIntegrationSection({ personaId, currentWpAuthorId, channelId }: WpIntegrationSectionProps) {
    const [mode, setMode] = useState<"link" | "create">("link")
    const [wpUsername, setWpUsername] = useState("")
    const [loading, setLoading] = useState(false)
    const [unlinking, setUnlinking] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [avatarWarning, setAvatarWarning] = useState<string | null>(null)
    const [result, setResult] = useState<number | null>(currentWpAuthorId)

    useEffect(() => {
        setResult(currentWpAuthorId)
    }, [currentWpAuthorId])

    async function handleSubmit() {
        if (!channelId) return
        setLoading(true)
        setError(null)
        setAvatarWarning(null)
        try {
            const res = await fetch(`/api/personas/${personaId}/integrations/wordpress`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: mode, wpUsername: mode === "link" ? wpUsername : undefined, channelId }),
            })
            const { data, error: apiError } = await res.json()
            if (apiError) {
                const errorMessage = getErrorMessage(apiError)
                setError(errorMessage)
                return
            }
            if (data?.wpAuthorId) {
                setResult(data.wpAuthorId)
                if (!data.avatarSynced && data.avatarSyncError) {
                    setAvatarWarning(`Avatar not synced to WordPress: ${data.avatarSyncError}`)
                }
            } else setError("Unexpected response from server")
        } catch {
            setError("Failed to link WordPress author")
        } finally {
            setLoading(false)
        }
    }

    async function handleUnlink() {
        setUnlinking(true)
        setError(null)
        try {
            const res = await fetch(`/api/personas/${personaId}/integrations/wordpress`, { method: "DELETE" })
            const { error: apiError } = await res.json()
            if (apiError) { setError(apiError.message ?? "Failed to unlink"); return }
            setResult(null)
        } catch {
            setError("Failed to unlink WordPress author")
        } finally {
            setUnlinking(false)
        }
    }

    if (result) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                    <Link2 className="h-4 w-4" />
                    WordPress author linked (ID: {result})
                </div>
                <Button type="button" size="sm" variant="outline" onClick={handleUnlink} disabled={unlinking}>
                    {unlinking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Unlink className="h-3 w-3 mr-1" />}
                    Disconnect
                </Button>
                {avatarWarning && <p className="text-xs text-amber-600">{avatarWarning}</p>}
                {error && <p className="text-xs text-destructive">{error}</p>}
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
