"use client"

import { useState } from "react"
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
    const [mode, setMode] = useState<"upload" | "ai">("upload")
    const [previewUrl, setPreviewUrl] = useState(currentUrl)
    const [generating, setGenerating] = useState(false)
    const [background, setBackground] = useState("")
    const [artStyle, setArtStyle] = useState("")
    const [faceMood, setFaceMood] = useState("")
    const [noFaceElement, setNoFaceElement] = useState("")

    async function handleGenerate() {
        if (!personaId) return
        setGenerating(true)
        try {
            const res = await fetch(`/api/personas/${personaId}/avatar/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ suggestions: { background, artStyle, faceMood, noFaceElement } }),
            })
            const { data } = await res.json()
            if (data?.avatarUrl) {
                setPreviewUrl(data.avatarUrl)
                onAccept(data.avatarUrl, data.avatarParamsJson)
            }
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
                <div className="flex gap-2">
                    <Button size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}>
                        <Upload className="h-3 w-3 mr-1" /> Upload
                    </Button>
                    <Button size="sm" variant={mode === "ai" ? "default" : "outline"} onClick={() => setMode("ai")}>
                        <Sparkles className="h-3 w-3 mr-1" /> AI Generate
                    </Button>
                </div>
            </div>

            {mode === "upload" && (
                <Input type="url" placeholder="Paste image URL or use file upload" onChange={e => { setPreviewUrl(e.target.value); onAccept(e.target.value, {}) }} />
            )}

            {mode === "ai" && (
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
                            <Label className="text-xs">Face Mood (if with face)</Label>
                            <Input value={faceMood} onChange={e => setFaceMood(e.target.value)} placeholder="Confident, friendly..." className="h-8" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">No Face Element</Label>
                            <Input value={noFaceElement} onChange={e => setNoFaceElement(e.target.value)} placeholder="A hawk, chess piece..." className="h-8" />
                        </div>
                    </div>
                    <Button onClick={handleGenerate} disabled={generating || !personaId} className="w-full" size="sm">
                        {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        Generate Avatar
                    </Button>
                    {!personaId && <p className="text-xs text-muted-foreground text-center">Save persona first to generate avatar.</p>}
                </div>
            )}
        </div>
    )
}
