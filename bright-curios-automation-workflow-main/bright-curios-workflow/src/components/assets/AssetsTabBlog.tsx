"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wand2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ImageGenerationCard from "./ImageGenerationCard";
import type { AssetRecord } from "@/components/images/ImageBankCard";
import type { BlogOutput } from "@/types/agents";
import {
    generateBlogFeaturedImagePrompt,
    generateBlogSectionImagePrompt,
    extractAgentImagePrompt,
} from "@/lib/ai/promptGenerators";

interface AssetsTabBlogProps {
    projectId: string;
    blogDraft?: BlogOutput | null;
    blogDraftId?: string | null;
}

export default function AssetsTabBlog({ projectId, blogDraft, blogDraftId }: AssetsTabBlogProps) {
    const { toast } = useToast();
    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatingAll, setGeneratingAll] = useState(false);

    const fetchAssets = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                projectId,
                contentType: "blog",
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
        return assets.find(a => a.role === role && (blogDraftId ? a.content_id === blogDraftId : true));
    }

    function handleGenerated(asset: AssetRecord) {
        setAssets(prev => {
            // Replace existing asset with same role, or prepend
            const filtered = prev.filter(a => !(a.role === asset.role && (blogDraftId ? a.content_id === blogDraftId : true)));
            return [asset, ...filtered];
        });
    }

    function handleDeleted(assetId: string) {
        setAssets(prev => prev.filter(a => a.id !== assetId));
    }

    async function handleGenerateAll() {
        if (!blogDraft) return;
        setGeneratingAll(true);
        const roles = [
            { role: "featured", label: "Featured Image" },
            ...(blogDraft.outline?.slice(0, 4).map((s, i) => ({
                role: `section_${i + 1}`,
                label: `Section ${i + 1}: ${s.h2}`,
            })) ?? []),
        ];

        let generated = 0;
        for (const { role, label } of roles) {
            if (getAssetForRole(role)) continue; // skip already generated
            const prompt = extractAgentImagePrompt(blogDraft.image_prompts, role)
                ?? (role === "featured"
                    ? generateBlogFeaturedImagePrompt(blogDraft.title)
                    : (() => {
                        const idx = parseInt(role.split("_")[1], 10) - 1;
                        const s = blogDraft.outline?.[idx];
                        return s ? generateBlogSectionImagePrompt(s.h2, s.key_points) : "";
                    })());
            if (!prompt) continue;

            try {
                const res = await fetch("/api/assets/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt,
                        project_id: projectId,
                        content_type: "blog",
                        content_id: blogDraftId ?? undefined,
                        role,
                        numImages: 1,
                        aspectRatio: "16:9",
                    }),
                });
                if (res.ok) {
                    const asset: AssetRecord = await res.json();
                    handleGenerated(asset);
                    generated++;
                }
            } catch { /* continue */ }
        }

        setGeneratingAll(false);
        toast({ title: `Generated ${generated} image(s)` });
    }

    const outline = blogDraft?.outline?.slice(0, 4) ?? [];
    const title = blogDraft?.title ?? "";

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
                    <h3 className="font-semibold">Blog Image Assets</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Generate AI images for your blog post. Prompts are pre-filled from the production agent when available.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open("/images", "_blank")}
                    >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Image Bank
                    </Button>
                    {blogDraft && (
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

            {/* Featured Image */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Featured Image</CardTitle>
                    <CardDescription className="text-xs">16:9 hero image for the blog post</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="max-w-sm">
                        <ImageGenerationCard
                            role="featured"
                            roleLabel="Featured Image"
                            suggestedPrompt={
                                extractAgentImagePrompt(blogDraft?.image_prompts, "featured")
                                ?? generateBlogFeaturedImagePrompt(title)
                            }
                            projectId={projectId}
                            contentType="blog"
                            contentId={blogDraftId ?? undefined}
                            existingAsset={getAssetForRole("featured")}
                            onGenerated={handleGenerated}
                            onDeleted={handleDeleted}
                            aspectRatio="16:9"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Section Images */}
            {outline.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Section Images</CardTitle>
                        <CardDescription className="text-xs">
                            Contextual images for each H2 section of the blog post
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {outline.map((section, i) => {
                                const role = `section_${i + 1}`;
                                const agentPrompt = extractAgentImagePrompt(blogDraft?.image_prompts, role);
                                return (
                                    <ImageGenerationCard
                                        key={role}
                                        role={role}
                                        roleLabel={`Section ${i + 1}: ${section.h2.slice(0, 30)}`}
                                        suggestedPrompt={
                                            agentPrompt ?? generateBlogSectionImagePrompt(section.h2, section.key_points)
                                        }
                                        projectId={projectId}
                                        contentType="blog"
                                        contentId={blogDraftId ?? undefined}
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

            {!blogDraft && (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground text-sm">
                        Generate blog content first to unlock AI-assisted image prompts.
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
