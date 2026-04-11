"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
    Loader2,
    Search,
    Check,
    Download,
    ExternalLink,
    Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UnsplashImage {
    id: string;
    description: string;
    alt_text: string;
    urls: {
        raw: string;
        full: string;
        regular: string;
        small: string;
        thumb: string;
    };
    links: {
        html: string;
        download_location: string;
    };
    user: {
        name: string;
        username: string;
        profile: string;
    };
    width: number;
    height: number;
}

interface UnsplashGridProps {
    projectId: string;
    defaultQuery?: string;
    onAssetSaved?: (assetId: string) => void;
}

export default function UnsplashGrid({
    projectId,
    defaultQuery = "",
    onAssetSaved,
}: UnsplashGridProps) {
    const { toast } = useToast();
    const [query, setQuery] = useState(defaultQuery);
    const [searchQuery, setSearchQuery] = useState(defaultQuery);
    const [images, setImages] = useState<UnsplashImage[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        if (defaultQuery) {
            handleSearch();
        }
    }, []);

    const handleSearch = async (resetPage = true) => {
        if (!query.trim()) {
            toast({
                title: "Search Required",
                description: "Please enter a search query",
                variant: "destructive",
            });
            return;
        }

        const currentPage = resetPage ? 1 : page;
        if (resetPage) {
            setPage(1);
            setImages([]);
        }

        setLoading(true);
        setSearchQuery(query);

        try {
            const response = await fetch(
                `/api/assets/unsplash/search?query=${encodeURIComponent(query)}&page=${currentPage}&per_page=20`
            );

            if (!response.ok) {
                throw new Error("Failed to search images");
            }

            const json = await response.json();
            const results = json.data?.results || [];

            if (resetPage) {
                setImages(results);
            } else {
                setImages((prev) => [...prev, ...results]);
            }

            setHasMore(results.length === 20);
        } catch (err) {
            toast({
                title: "Search Failed",
                description: "Could not fetch images from Unsplash",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleLoadMore = () => {
        setPage((prev) => prev + 1);
        handleSearch(false);
    };

    const handleSaveAsset = async (
        image: UnsplashImage,
        assetType: "featured_image" | "content_image"
    ) => {
        setSaving(image.id);

        try {
            const response = await fetch("/api/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project_id: projectId,
                    asset_type: assetType,
                    source: "unsplash",
                    source_url: image.urls.regular,
                    alt_text: image.alt_text || image.description,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to save asset");
            }

            const json = await response.json();
            const assetId = json.data?.id;

            setSelectedImages((prev) => new Set(prev).add(image.id));

            toast({
                title: "Asset Saved",
                description: `Image saved as ${assetType.replace("_", " ")}`,
            });

            if (onAssetSaved && assetId) {
                onAssetSaved(assetId);
            }

            // Trigger download for Unsplash attribution requirements
            triggerUnsplashDownload(image.links.download_location);
        } catch (err) {
            toast({
                title: "Save Failed",
                description: "Could not save asset to project",
                variant: "destructive",
            });
        } finally {
            setSaving(null);
        }
    };

    const triggerUnsplashDownload = async (downloadLocation: string) => {
        try {
            // This notifies Unsplash of the download for attribution tracking
            await fetch(downloadLocation);
        } catch {
            // Silent fail - not critical
        }
    };

    return (
        <div className="space-y-6">
            {/* Search Bar */}
            <div className="flex gap-2">
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            handleSearch(true);
                        }
                    }}
                    placeholder="Search for images (e.g., productivity, workspace)"
                    className="flex-1"
                />
                <Button
                    onClick={() => handleSearch(true)}
                    disabled={loading || !query.trim()}
                    className="gap-2"
                >
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Search className="h-4 w-4" />
                    )}
                    Search
                </Button>
            </div>

            {/* Results Info */}
            {searchQuery && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Results for <span className="font-medium">"{searchQuery}"</span>
                    </p>
                    <a
                        href="https://unsplash.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                        Powered by Unsplash
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
            )}

            {/* Images Grid */}
            {images.length === 0 && !loading ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">
                            {searchQuery
                                ? "No images found. Try a different search term."
                                : "Enter a search term to find images"}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {images.map((image) => (
                            <Card
                                key={image.id}
                                className="overflow-hidden hover:shadow-lg transition-shadow"
                            >
                                <div className="relative aspect-square">
                                    <img
                                        src={image.urls.small}
                                        alt={image.alt_text}
                                        className="w-full h-full object-cover"
                                    />
                                    {selectedImages.has(image.id) && (
                                        <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                                            <Check className="h-4 w-4" />
                                        </div>
                                    )}
                                </div>
                                <CardContent className="p-3 space-y-2">
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {image.description || image.alt_text || "Untitled"}
                                    </p>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <span>by</span>
                                        <a
                                            href={image.user.profile}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium hover:text-foreground"
                                        >
                                            {image.user.name}
                                        </a>
                                    </div>
                                    <div className="flex gap-1 pt-1">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                handleSaveAsset(image, "featured_image")
                                            }
                                            disabled={saving === image.id}
                                            className="flex-1 text-xs h-7"
                                        >
                                            {saving === image.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                "Featured"
                                            )}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                handleSaveAsset(image, "content_image")
                                            }
                                            disabled={saving === image.id}
                                            className="flex-1 text-xs h-7"
                                        >
                                            {saving === image.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                "Content"
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Load More */}
                    {hasMore && !loading && images.length > 0 && (
                        <div className="flex justify-center pt-4">
                            <Button
                                onClick={handleLoadMore}
                                variant="outline"
                                className="gap-2"
                            >
                                Load More Images
                            </Button>
                        </div>
                    )}

                    {loading && page > 1 && (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
