"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wand2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
    generateBlogFeaturedImagePrompt,
    generateStandalonePrompt,
} from "@/lib/ai/promptGenerators";
import type { AssetRecord } from "./ImageBankCard";

type ContentType = "blog" | "video" | "standalone";
type ImageStyle = "editorial_photo" | "digital_illustration" | "minimalist" | "bold_graphic";

interface PromptBuilderProps {
    projectId?: string;
    onGenerated: (asset: AssetRecord) => void;
}

const styleLabels: Record<ImageStyle, string> = {
    editorial_photo: "Editorial Photography",
    digital_illustration: "Digital Illustration",
    minimalist: "Minimalist",
    bold_graphic: "Bold Graphic",
};

export default function PromptBuilder({ projectId, onGenerated }: PromptBuilderProps) {
    const { toast } = useToast();

    const [contentType, setContentType] = useState<ContentType>("standalone");
    const [title, setTitle] = useState("");
    const [style, setStyle] = useState<ImageStyle>("editorial_photo");
    const [mood, setMood] = useState("");
    const [prompt, setPrompt] = useState("");
    const [generating, setGenerating] = useState(false);

    function buildSuggestedPrompt() {
        if (contentType === "blog" && title) {
            return generateBlogFeaturedImagePrompt(title, undefined, "professional");
        }
        return generateStandalonePrompt(title || "abstract concept", style, mood || undefined);
    }

    function handleSuggest() {
        const suggested = buildSuggestedPrompt();
        setPrompt(suggested);
    }

    async function handleGenerate() {
        if (!prompt.trim()) {
            toast({ title: "Prompt required", description: "Enter a prompt before generating", variant: "destructive" });
            return;
        }

        setGenerating(true);
        try {
            const res = await fetch("/api/assets/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    project_id: projectId ?? undefined,
                    content_type: contentType === "standalone" ? undefined : contentType,
                    role: undefined,
                    numImages: 1,
                    aspectRatio: "16:9",
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error ?? "Generation failed");
            }

            const asset: AssetRecord = await res.json();
            onGenerated(asset);
            toast({ title: "Image generated", description: "Added to your Image Bank" });
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

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    Prompt Builder
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Content type */}
                <div>
                    <Label className="text-xs">Content Type</Label>
                    <div className="flex gap-2 mt-1">
                        {(["standalone", "blog", "video"] as ContentType[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => setContentType(t)}
                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                                    contentType === t
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-border hover:bg-muted"
                                }`}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Title / theme */}
                <div>
                    <Label htmlFor="pb-title" className="text-xs">
                        {contentType === "blog" ? "Article Title" : "Theme / Subject"}
                    </Label>
                    <Input
                        id="pb-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={contentType === "blog" ? "e.g. The Hidden Science of Sleep" : "e.g. urban nature"}
                        className="mt-1 text-sm"
                    />
                </div>

                {/* Style (standalone only) */}
                {contentType === "standalone" && (
                    <div>
                        <Label className="text-xs">Image Style</Label>
                        <Select value={style} onValueChange={(v) => setStyle(v as ImageStyle)}>
                            <SelectTrigger className="mt-1 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(styleLabels).map(([val, label]) => (
                                    <SelectItem key={val} value={val}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Mood */}
                <div>
                    <Label htmlFor="pb-mood" className="text-xs">Mood (optional)</Label>
                    <Input
                        id="pb-mood"
                        value={mood}
                        onChange={(e) => setMood(e.target.value)}
                        placeholder="e.g. calm, energetic, mysterious"
                        className="mt-1 text-sm"
                    />
                </div>

                {/* Suggest button */}
                <Button variant="outline" size="sm" onClick={handleSuggest} className="w-full">
                    <Sparkles className="h-3 w-3 mr-2" />
                    Build Prompt from Context
                </Button>

                {/* Prompt textarea */}
                <div>
                    <Label htmlFor="pb-prompt" className="text-xs">Prompt</Label>
                    <Textarea
                        id="pb-prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the image you want to generate..."
                        rows={4}
                        className="mt-1 text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        {prompt.length}/500 — No text or words in the image for best results
                    </p>
                </div>

                <Button onClick={handleGenerate} disabled={generating} className="w-full">
                    {generating ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                        </>
                    ) : (
                        <>
                            <Wand2 className="h-4 w-4 mr-2" />
                            Generate Image
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}
