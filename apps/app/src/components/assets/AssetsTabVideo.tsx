"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wand2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ImageGenerationCard from "./ImageGenerationCard";
import type { AssetRecord } from "@/components/images/ImageBankCard";
import type { VideoOutput } from "@brighttale/shared/types/agents";
import {
    generateVideoThumbnailPrompt,
    generateVideoChapterImagePrompt,
    extractAgentImagePrompt,
} from "@/lib/ai/promptGenerators";

interface AssetsTabVideoProps {
    projectId: string;
    videoDraft?: VideoOutput | null;
    videoDraftId?: string | null;
}

export default function AssetsTabVideo({ projectId, videoDraft, videoDraftId }: AssetsTabVideoProps) {
    const { toast } = useToast();
    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatingAll, setGeneratingAll] = useState(false);

    const fetchAssets = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                projectId,
                contentType: "video",
                source: "generated",
                limit: "50",
            });
            const res = await fetch(`/api/assets?${params}`);
            if (!res.ok) return;
            const data = await res.json();
            setAssets(data.assets ?? []);
        } catch {
            // non-critical
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);

    function getAssetForRole(role: string): AssetRecord | undefined {
        return assets.find(a => a.role === role && (videoDraftId ? a.content_id === videoDraftId : true));
    }

    function handleGenerated(asset: AssetRecord) {
        setAssets(prev => {
            const filtered = prev.filter(a => !(a.role === asset.role && (videoDraftId ? a.content_id === videoDraftId : true)));
            return [asset, ...filtered];
        });
    }

    function handleDeleted(assetId: string) {
        setAssets(prev => prev.filter(a => a.id !== assetId));
    }

    async function generateRole(role: string, prompt: string) {
        const res = await fetch("/api/assets/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt,
                project_id: projectId,
                content_type: "video",
                content_id: videoDraftId ?? undefined,
                role,
                numImages: 1,
                aspectRatio: role.startsWith("thumbnail") ? "16:9" : "16:9",
            }),
        });
        if (res.ok) {
            const asset: AssetRecord = await res.json();
            handleGenerated(asset);
            return true;
        }
        return false;
    }

    async function handleGenerateAll() {
        if (!videoDraft) return;
        setGeneratingAll(true);

        const title = videoDraft.title_options?.[0] ?? "";
        const roles: Array<{ role: string; prompt: string }> = [
            {
                role: "thumbnail_option_1",
                prompt: extractAgentImagePrompt(videoDraft.image_prompts, "thumbnail_option_1")
                    ?? generateVideoThumbnailPrompt(title, videoDraft.thumbnail?.visual_concept, videoDraft.thumbnail?.emotion),
            },
            {
                role: "thumbnail_option_2",
                prompt: extractAgentImagePrompt(videoDraft.image_prompts, "thumbnail_option_2")
                    ?? generateVideoThumbnailPrompt(title, "dramatic close-up", "intrigue"),
            },
            ...(videoDraft.script?.chapters?.slice(0, 4).map((ch, i) => ({
                role: `chapter_${i + 1}`,
                prompt: extractAgentImagePrompt(videoDraft.image_prompts, `chapter_${i + 1}`)
                    ?? generateVideoChapterImagePrompt(ch.title),
            })) ?? []),
        ];

        let generated = 0;
        for (const { role, prompt } of roles) {
            if (getAssetForRole(role)) continue;
            const ok = await generateRole(role, prompt);
            if (ok) generated++;
        }

        setGeneratingAll(false);
        toast({ title: `Generated ${generated} image(s)` });
    }

    const title = videoDraft?.title_options?.[0] ?? "";
    const chapters = videoDraft?.script?.chapters?.slice(0, 4) ?? [];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-semibold">Video Image Assets</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Generate thumbnails and chapter visuals for your YouTube video.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.open("/images", "_blank")}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Image Bank
                    </Button>
                    {videoDraft && (
                        <Button size="sm" onClick={handleGenerateAll} disabled={generatingAll}>
                            {generatingAll ? (
                                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating all...</>
                            ) : (
                                <><Wand2 className="h-3.5 w-3.5 mr-1.5" />Generate All Missing</>
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {/* Thumbnail Options */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Thumbnail Options</CardTitle>
                    <CardDescription className="text-xs">
                        Two thumbnail variants for A/B testing on YouTube
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                        <ImageGenerationCard
                            role="thumbnail_option_1"
                            roleLabel="Thumbnail Option 1"
                            suggestedPrompt={
                                extractAgentImagePrompt(videoDraft?.image_prompts, "thumbnail_option_1")
                                ?? generateVideoThumbnailPrompt(title, videoDraft?.thumbnail?.visual_concept, videoDraft?.thumbnail?.emotion)
                            }
                            projectId={projectId}
                            contentType="video"
                            contentId={videoDraftId ?? undefined}
                            existingAsset={getAssetForRole("thumbnail_option_1")}
                            onGenerated={handleGenerated}
                            onDeleted={handleDeleted}
                            aspectRatio="16:9"
                        />
                        <ImageGenerationCard
                            role="thumbnail_option_2"
                            roleLabel="Thumbnail Option 2"
                            suggestedPrompt={
                                extractAgentImagePrompt(videoDraft?.image_prompts, "thumbnail_option_2")
                                ?? generateVideoThumbnailPrompt(title, "dramatic close-up", "intrigue")
                            }
                            projectId={projectId}
                            contentType="video"
                            contentId={videoDraftId ?? undefined}
                            existingAsset={getAssetForRole("thumbnail_option_2")}
                            onGenerated={handleGenerated}
                            onDeleted={handleDeleted}
                            aspectRatio="16:9"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Chapter Images */}
            {chapters.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Chapter B-Roll Visuals</CardTitle>
                        <CardDescription className="text-xs">
                            Illustrative images for video chapters (useful for social clips, blog embeds)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {chapters.map((ch, i) => {
                                const role = `chapter_${i + 1}`;
                                return (
                                    <ImageGenerationCard
                                        key={role}
                                        role={role}
                                        roleLabel={`Ch.${i + 1}: ${ch.title.slice(0, 25)}`}
                                        suggestedPrompt={
                                            extractAgentImagePrompt(videoDraft?.image_prompts, role)
                                            ?? generateVideoChapterImagePrompt(ch.title)
                                        }
                                        projectId={projectId}
                                        contentType="video"
                                        contentId={videoDraftId ?? undefined}
                                        existingAsset={getAssetForRole(role)}
                                        onGenerated={handleGenerated}
                                        onDeleted={handleDeleted}
                                        aspectRatio="16:9"
                                    />
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {!videoDraft && (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground text-sm">
                        Generate video content first to unlock AI-assisted image prompts.
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
