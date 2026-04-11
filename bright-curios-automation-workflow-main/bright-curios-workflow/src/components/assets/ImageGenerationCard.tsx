"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Wand2, Pencil, RefreshCw, Download, Trash2, ImageIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AssetRecord } from "@/components/images/ImageBankCard";

interface ImageGenerationCardProps {
    role: string;                      // "featured", "section_1", "thumbnail_option_1", etc.
    roleLabel: string;                 // Human-readable: "Featured Image", "Section 1"
    suggestedPrompt?: string;          // Pre-filled from AI agent output or template
    projectId?: string;
    contentType?: "blog" | "video" | "shorts" | "podcast";
    contentId?: string;
    existingAsset?: AssetRecord;
    onGenerated: (asset: AssetRecord) => void;
    onDeleted: (assetId: string) => void;
    aspectRatio?: string;
}

export default function ImageGenerationCard({
    role,
    roleLabel,
    suggestedPrompt = "",
    projectId,
    contentType,
    contentId,
    existingAsset,
    onGenerated,
    onDeleted,
    aspectRatio = "16:9",
}: ImageGenerationCardProps) {
    const { toast } = useToast();

    const [prompt, setPrompt] = useState(existingAsset?.prompt ?? suggestedPrompt);
    const [editingPrompt, setEditingPrompt] = useState(!existingAsset);
    const [generating, setGenerating] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [asset, setAsset] = useState<AssetRecord | undefined>(existingAsset);

    async function fetchSuggestions() {
        setLoadingSuggestions(true);
        try {
            const res = await fetch("/api/assets/generate/suggest-prompts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content_type: contentType ?? "standalone",
                    title: "",
                    role,
                }),
            });
            if (!res.ok) return;
            const data = await res.json();
            setSuggestions(data.suggestions ?? []);
        } catch {
            // non-critical
        } finally {
            setLoadingSuggestions(false);
        }
    }

    async function handleGenerate() {
        if (!prompt.trim()) {
            toast({ title: "Prompt required", variant: "destructive" });
            return;
        }

        setGenerating(true);
        try {
            const res = await fetch("/api/assets/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    project_id: projectId,
                    content_type: contentType,
                    content_id: contentId,
                    role,
                    numImages: 1,
                    aspectRatio,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error ?? "Generation failed");
            }

            const newAsset: AssetRecord = await res.json();
            setAsset(newAsset);
            setEditingPrompt(false);
            setSuggestions([]);
            onGenerated(newAsset);
            toast({ title: `${roleLabel} generated` });
        } catch (error: unknown) {
            toast({
                title: "Generation failed",
                description: error instanceof Error ? error.message : "Unknown error",
                variant: "destructive",
            });
        } finally {
            setGenerating(false);
        }
    }

    async function handleDelete() {
        if (!asset) return;
        if (!confirm("Delete this image?")) return;
        try {
            await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
            onDeleted(asset.id);
            setAsset(undefined);
            setEditingPrompt(true);
            toast({ title: "Image deleted" });
        } catch {
            toast({ title: "Delete failed", variant: "destructive" });
        }
    }

    return (
        <Card className="overflow-hidden">
            <CardContent className="p-3 space-y-3">
                {/* Role label */}
                <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{roleLabel}</Badge>
                    {asset && (
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => window.open(`/api/assets/${asset.id}/download`, "_blank")}
                            >
                                <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setEditingPrompt(!editingPrompt)}
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={handleDelete}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </div>

                {/* Image preview */}
                {asset?.source_url ? (
                    <div className="aspect-video rounded overflow-hidden bg-muted">
                        <img
                            src={asset.source_url}
                            alt={roleLabel}
                            className="w-full h-full object-cover"
                        />
                    </div>
                ) : (
                    <div className="aspect-video rounded bg-muted flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground opacity-40" />
                    </div>
                )}

                {/* Prompt editor */}
                {editingPrompt && (
                    <div className="space-y-2">
                        <Textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe the image to generate..."
                            rows={3}
                            className="text-xs"
                        />

                        {/* Suggestions */}
                        {suggestions.length > 0 && (
                            <div className="space-y-1">
                                {suggestions.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { setPrompt(s); setSuggestions([]); }}
                                        className="w-full text-left text-xs p-2 rounded border hover:bg-muted transition-colors truncate"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 flex-1"
                                onClick={fetchSuggestions}
                                disabled={loadingSuggestions}
                            >
                                {loadingSuggestions ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    "Suggestions"
                                )}
                            </Button>
                            <Button
                                size="sm"
                                className="text-xs h-7 flex-1"
                                onClick={handleGenerate}
                                disabled={generating}
                            >
                                {generating ? (
                                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating</>
                                ) : asset ? (
                                    <><RefreshCw className="h-3 w-3 mr-1" />Regenerate</>
                                ) : (
                                    <><Wand2 className="h-3 w-3 mr-1" />Generate</>
                                )}
                            </Button>
                            {asset && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => { setEditingPrompt(false); setSuggestions([]); }}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* Prompt display (when not editing) */}
                {!editingPrompt && asset?.prompt && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{asset.prompt}</p>
                )}
            </CardContent>
        </Card>
    );
}
