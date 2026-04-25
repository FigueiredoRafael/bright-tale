"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Loader2, Upload, Sparkles } from "lucide-react"

interface AvatarSectionProps {
    personaId: string
    currentUrl: string | null
    onAccept: (url: string, params: Record<string, unknown>) => void
}

export function AvatarSection({ personaId, currentUrl, onAccept }: AvatarSectionProps) {
    const [previewUrl, setPreviewUrl] = useState(currentUrl)
    const [showAi, setShowAi] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [background, setBackground] = useState("")
    const [artStyle, setArtStyle] = useState("")
    const [faceMood, setFaceMood] = useState("")
    const [noFaceElement, setNoFaceElement] = useState("")
    const fileInputRef = useRef<HTMLInputElement>(null)

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file || !personaId) return
        setUploading(true)
        setError(null)
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = reject
                reader.readAsDataURL(file)
            })
            const res = await fetch(`/api/personas/${personaId}/avatar/upload`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataUrl }),
            })
            const { data, error: apiError } = await res.json()
            if (apiError) { setError(apiError.message ?? "Upload failed"); return }
            if (data?.avatarUrl) {
                setPreviewUrl(data.avatarUrl)
                onAccept(data.avatarUrl, data.avatarParamsJson ?? {})
            }
        } catch {
            setError("Upload failed")
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    async function handleGenerate() {
        if (!personaId) return
        setGenerating(true)
        setError(null)
        try {
            const res = await fetch(`/api/personas/${personaId}/avatar/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ suggestions: { background, artStyle, faceMood, noFaceElement } }),
            })
            const { data, error: apiError } = await res.json()
            if (apiError) { setError(apiError.message ?? "Failed to generate avatar"); return }
            if (data?.avatarUrl) {
                setPreviewUrl(data.avatarUrl)
                onAccept(data.avatarUrl, data.avatarParamsJson)
            } else {
                setError("No avatar returned")
            }
        } catch {
            setError("Failed to generate avatar")
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20 rounded-xl">
                    <AvatarImage src={previewUrl ?? undefined} />
                    <AvatarFallback className="rounded-xl text-2xl">?</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={uploading || !personaId}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                        {uploading ? "Uploading…" : "Upload image"}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={showAi ? "default" : "outline"}
                        onClick={() => setShowAi(v => !v)}
                    >
                        <Sparkles className="h-3 w-3 mr-1" /> AI Generate
                    </Button>
                </div>
            </div>

            {!personaId && (
                <p className="text-xs text-muted-foreground">Save persona first to upload or generate an avatar.</p>
            )}

            {showAi && (
                <div className="space-y-3 border rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Background</Label>
                            <Input value={background} onChange={e => setBackground(e.target.value)} placeholder="dark studio, outdoors..." className="h-8" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Art Style</Label>
                            <Input value={artStyle} onChange={e => setArtStyle(e.target.value)} placeholder="Illustrated, photorealistic..." className="h-8" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Face Mood</Label>
                            <Input value={faceMood} onChange={e => setFaceMood(e.target.value)} placeholder="Confident, friendly..." className="h-8" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">No Face Element</Label>
                            <Input value={noFaceElement} onChange={e => setNoFaceElement(e.target.value)} placeholder="A hawk, chess piece..." className="h-8" />
                        </div>
                    </div>
                    <Button type="button" onClick={handleGenerate} disabled={generating || !personaId} className="w-full" size="sm">
                        {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        Generate Avatar
                    </Button>
                </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    )
}
