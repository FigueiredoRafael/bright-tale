"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    Loader2,
    Check,
    AlertCircle,
    Globe,
    Upload,
    Eye,
    ExternalLink,
    Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BlogOutput, ReviewOutput } from "@brighttale/shared/types/agents";
import yaml from "js-yaml";

interface WordPressConfig {
    id: string;
    site_url: string;
    username: string;
}

interface Asset {
    id: string;
    asset_type: string;
    source: string;
    source_url: string | null;
    local_path: string | null;
    alt_text: string | null;
    role: string | null;
}

interface PublishingFormProps {
    projectId: string;
    blogContent?: BlogOutput;
    initialYaml?: string;
    onSave?: (yamlContent: string) => void;
    onComplete?: (yamlContent: string) => void;
    saving?: boolean;
}

export default function PublishingForm({
    projectId,
    blogContent,
    initialYaml,
    onSave,
    onComplete,
    saving = false,
}: PublishingFormProps) {
    const { toast } = useToast();

    // State
    const [configs, setConfigs] = useState<WordPressConfig[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState("");
    const [assets, setAssets] = useState<Asset[]>([]);
    const [selectedFeaturedImage, setSelectedFeaturedImage] = useState("");
    const [categories, setCategories] = useState<string[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [categoryInput, setCategoryInput] = useState("");
    const [tagInput, setTagInput] = useState("");
    const [publishStatus, setPublishStatus] = useState<"draft" | "publish">("draft");

    // Self-fetched blog content (when not passed as prop)
    const [fetchedBlogContent, setFetchedBlogContent] = useState<BlogOutput | null>(null);
    const resolvedBlogContent = blogContent ?? fetchedBlogContent ?? null;

    // Loading states
    const [loadingConfigs, setLoadingConfigs] = useState(true);
    const [loadingAssets, setLoadingAssets] = useState(false);
    const [publishing, setPublishing] = useState(false);

    useEffect(() => {
        const fetchReviewMetadata = async () => {
            try {
                const response = await fetch(`/api/stages/${projectId}/review`);
                if (response.ok) {
                    const json = await response.json();
                    const yamlContent = json.data?.stage?.yaml_artifact;
                    if (yamlContent) {
                        const parsed = yaml.load(yamlContent) as Record<string, unknown>;
                        const reviewOutput = ((parsed?.review_output ?? parsed) as ReviewOutput);
                        if (reviewOutput?.publication_plan?.blog) {
                            const blogPlan = reviewOutput.publication_plan.blog;
                            if (blogPlan.categories && blogPlan.categories.length > 0) {
                                setCategories(blogPlan.categories);
                            }
                            if (blogPlan.tags && blogPlan.tags.length > 0) {
                                setTags(blogPlan.tags);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch review metadata:", err);
            }
        };

        const fetchBlogContent = async () => {
            try {
                const response = await fetch(`/api/stages/${projectId}/production`);
                if (!response.ok) return;
                const json = await response.json();
                const yamlContent = json.data?.stage?.yaml_artifact;
                if (!yamlContent) return;
                const parsed = yaml.load(yamlContent) as Record<string, unknown>;
                const blog = (parsed?.production_output as Record<string, unknown>)?.blog as BlogOutput | undefined;
                if (blog) setFetchedBlogContent(blog);
            } catch {
                // Non-critical, ignore
            }
        };

        const fetchConfigs = async () => {
            try {
                setLoadingConfigs(true);
                const response = await fetch("/api/wordpress/config");
                const json = await response.json();
                if (json.data) {
                    setConfigs(json.data);
                    if (json.data.length > 0) {
                        setSelectedConfigId(json.data[0].id);
                    }
                }
            } catch {
                toast({
                    title: "Error",
                    description: "Failed to load WordPress configurations",
                    variant: "destructive",
                });
            } finally {
                setLoadingConfigs(false);
            }
        };

        const fetchAssets = async () => {
            try {
                setLoadingAssets(true);
                const response = await fetch(`/api/assets/project/${projectId}`);
                const json = await response.json();
                if (json.data?.assets) {
                    setAssets(json.data.assets);
                    const featuredImage = json.data.assets.find((a: Asset) => a.asset_type === "featured_image");
                    if (featuredImage) {
                        setSelectedFeaturedImage(featuredImage.id);
                    }
                }
            } catch (err) {
                console.error("Failed to load assets:", err);
            } finally {
                setLoadingAssets(false);
            }
        };

        void fetchConfigs();
        void fetchAssets();
        void fetchReviewMetadata();
        void fetchBlogContent();
    }, [projectId, toast]);

    // Restore saved state from initialYaml
    useEffect(() => {
        if (!initialYaml) return;
        try {
            const parsed = yaml.load(initialYaml) as Record<string, unknown>;
            if (parsed && typeof parsed === "object") {
                if (parsed.selectedConfigId) setSelectedConfigId(String(parsed.selectedConfigId));
                if (parsed.selectedFeaturedImage) setSelectedFeaturedImage(String(parsed.selectedFeaturedImage));
                if (Array.isArray(parsed.categories)) setCategories(parsed.categories as string[]);
                if (Array.isArray(parsed.tags)) setTags(parsed.tags as string[]);
                if (parsed.publishStatus === "publish" || parsed.publishStatus === "draft") {
                    setPublishStatus(parsed.publishStatus);
                }
            }
        } catch {
            // Invalid YAML, ignore
        }
    }, [initialYaml]);

    const handleAddCategory = () => {
        if (categoryInput.trim() && !categories.includes(categoryInput.trim())) {
            setCategories([...categories, categoryInput.trim()]);
            setCategoryInput("");
        }
    };

    const handleRemoveCategory = (category: string) => {
        setCategories(categories.filter((c) => c !== category));
    };

    const handleAddTag = () => {
        if (tagInput.trim() && !tags.includes(tagInput.trim())) {
            setTags([...tags, tagInput.trim()]);
            setTagInput("");
        }
    };

    const handleRemoveTag = (tag: string) => {
        setTags(tags.filter((t) => t !== tag));
    };

    const handleSaveProgress = () => {
        if (!onSave) return;
        const publishingData = {
            selectedConfigId,
            selectedFeaturedImage,
            categories,
            tags,
            publishStatus,
        };
        onSave(yaml.dump(publishingData));
    };

    const handlePublish = async () => {
        if (!selectedConfigId) {
            toast({
                title: "Configuration Required",
                description: "Please select a WordPress configuration",
                variant: "destructive",
            });
            return;
        }

        if (!resolvedBlogContent) {
            toast({
                title: "No Content",
                description: "No blog content found to publish",
                variant: "destructive",
            });
            return;
        }

        setPublishing(true);

        try {
            const response = await fetch("/api/wordpress/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project_id: projectId,
                    config_id: selectedConfigId,
                    status: publishStatus,
                    featured_image_asset_id: selectedFeaturedImage || undefined,
                    categories,
                    tags,
                }),
            });

            if (!response.ok) {
                const json = await response.json();
                throw new Error(json.error || "Failed to publish");
            }

            const json = await response.json();
            const wpData = json.data;

            toast({
                title: "Published Successfully",
                description: wpData?.wordpress_url
                    ? `Your blog post has been published to WordPress. View it at: ${wpData.wordpress_url}`
                    : "Your blog post has been published to WordPress",
            });
        } catch (err: any) {
            toast({
                title: "Publish Failed",
                description: err.message || "Could not publish to WordPress",
                variant: "destructive",
            });
        } finally {
            setPublishing(false);
        }
    };

    if (loadingConfigs) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (configs.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">No WordPress Configuration</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                        You need to configure a WordPress site before publishing
                    </p>
                    <Button asChild>
                        <Link href="/channels">Configure WordPress</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Blog Preview */}
            {resolvedBlogContent && (
                <Card className="border-blue-200 bg-blue-50/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Blog Preview
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <h2 className="text-xl font-bold">{resolvedBlogContent.title}</h2>
                        <p className="text-sm text-muted-foreground">{resolvedBlogContent.meta_description}</p>
                        <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">
                                {resolvedBlogContent.word_count} words
                            </Badge>
                            {resolvedBlogContent.primary_keyword && (
                                <Badge variant="outline" className="text-xs">
                                    {resolvedBlogContent.primary_keyword}
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* WordPress Configuration */}
            <Card>
                <CardHeader>
                    <CardTitle>WordPress Site</CardTitle>
                    <CardDescription>
                        Select which WordPress site to publish to
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select WordPress site" />
                        </SelectTrigger>
                        <SelectContent>
                            {configs.map((config) => (
                                <SelectItem key={config.id} value={config.id}>
                                    {config.site_url} ({config.username})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* Featured Image */}
            <Card>
                <CardHeader>
                    <CardTitle>Featured Image</CardTitle>
                    <CardDescription>
                        Select a featured image from your project assets
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loadingAssets ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : assets.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No assets found. Add images in the Production stage Assets tab.
                        </p>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {assets.map((asset) => (
                                <button
                                    key={asset.id}
                                    type="button"
                                    onClick={() => setSelectedFeaturedImage(asset.id)}
                                    className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${selectedFeaturedImage === asset.id
                                        ? "border-green-500 ring-2 ring-green-200"
                                        : "border-border hover:border-border"
                                        }`}
                                >
                                    <Image
                                        src={asset.source_url ?? ""}
                                        alt={asset.alt_text || "Asset"}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                    {selectedFeaturedImage === asset.id && (
                                        <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                                            <Check className="h-3 w-3" />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                                        {asset.asset_type.replace("_", " ")}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Categories and Tags */}
            <Card>
                <CardHeader>
                    <CardTitle>Categories and Tags</CardTitle>
                    <CardDescription>
                        Add categories and tags for your blog post. New items will be created automatically.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Categories */}
                    <div>
                        <Label>Categories</Label>
                        <div className="flex gap-2 mt-2">
                            <Input
                                value={categoryInput}
                                onChange={(e) => setCategoryInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddCategory();
                                    }
                                }}
                                placeholder="Type a category and press Enter"
                            />
                            <Button onClick={handleAddCategory} variant="outline">
                                Add
                            </Button>
                        </div>
                        {categories.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {categories.map((category) => (
                                    <Badge
                                        key={category}
                                        variant="secondary"
                                        className="cursor-pointer"
                                        onClick={() => handleRemoveCategory(category)}
                                    >
                                        {category} ×
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tags */}
                    <div>
                        <Label>Tags</Label>
                        <div className="flex gap-2 mt-2">
                            <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddTag();
                                    }
                                }}
                                placeholder="Type a tag and press Enter"
                            />
                            <Button onClick={handleAddTag} variant="outline">
                                Add
                            </Button>
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {tags.map((tag) => (
                                    <Badge
                                        key={tag}
                                        variant="outline"
                                        className="cursor-pointer"
                                        onClick={() => handleRemoveTag(tag)}
                                    >
                                        {tag} ×
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Publish Status */}
            <Card>
                <CardHeader>
                    <CardTitle>Publish Status</CardTitle>
                    <CardDescription>
                        Choose whether to publish immediately or save as draft
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={publishStatus} onValueChange={(v: any) => setPublishStatus(v)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="draft">Save as Draft</SelectItem>
                            <SelectItem value="publish">Publish Immediately</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* Generated Assets Download Section */}
            {assets.filter(a => a.source === "generated" && a.local_path).length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            Generated Images for Publishing
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Download these AI-generated images and upload them manually to WordPress and YouTube before publishing.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                            {assets
                                .filter(a => a.source === "generated" && a.source_url)
                                .map((asset) => (
                                    <div key={asset.id} className="space-y-1">
                                        <div className="relative aspect-video rounded overflow-hidden bg-muted border">
                                            <Image
                                                src={asset.source_url!}
                                                alt={asset.role ?? "image"}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-xs text-muted-foreground truncate">
                                                {asset.role ?? "image"}
                                            </span>
                                            <button
                                                onClick={() => window.open(`/api/assets/${asset.id}/download`, "_blank")}
                                                className="text-xs text-primary hover:underline shrink-0"
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>
                                ))}
                        </div>
                        <button
                            onClick={() => {
                                const ids = assets
                                    .filter(a => a.source === "generated")
                                    .map(a => a.id)
                                    .join(",");
                                window.open(`/api/assets/download?ids=${ids}`, "_blank");
                            }}
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                            <Download className="h-3.5 w-3.5" />
                            Download all generated images as ZIP
                        </button>
                    </CardContent>
                </Card>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between pt-4 border-t">
                <div>
                    {onSave && (
                        <Button
                            variant="outline"
                            onClick={handleSaveProgress}
                            disabled={saving}
                        >
                            {saving ? "Saving..." : "Save Progress"}
                        </Button>
                    )}
                </div>
                <Button
                    onClick={handlePublish}
                    disabled={publishing || !selectedConfigId}
                    className="gap-2"
                    size="lg"
                >
                    {publishing ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Publishing...
                        </>
                    ) : (
                        <>
                            <Upload className="h-4 w-4" />
                            Publish to WordPress
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
