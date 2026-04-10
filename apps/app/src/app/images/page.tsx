"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download, Trash2, Images, RefreshCw, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ImageBankCard, { type AssetRecord } from "@/components/images/ImageBankCard";
import PromptBuilder from "@/components/images/PromptBuilder";
import RegenerateDialog from "@/components/images/RegenerateDialog";

interface Project {
    id: string;
    title: string;
}

const CONTENT_TYPES = ["all", "blog", "video", "shorts", "podcast", "standalone"] as const;
type ContentTypeFilter = (typeof CONTENT_TYPES)[number];

const PAGE_SIZE = 24;

export default function ImageBankPage() {
    const { toast } = useToast();

    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    const [contentType, setContentType] = useState<ContentTypeFilter>("all");
    const [projectFilter, setProjectFilter] = useState<string>("all");
    const [search, setSearch] = useState("");
    const [projects, setProjects] = useState<Project[]>([]);

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [builderOpen, setBuilderOpen] = useState(false);

    const [regenerateAsset, setRegenerateAsset] = useState<AssetRecord | null>(null);

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [contentType, projectFilter, search]);

    useEffect(() => {
        fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentType, projectFilter, search, page]);

    async function fetchProjects() {
        try {
            const res = await fetch("/api/projects?limit=100");
            if (!res.ok) return;
            const data = await res.json();
            setProjects(Array.isArray(data) ? data : (data.projects ?? []));
        } catch {
            // non-critical
        }
    }

    const fetchAssets = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                source: "generated",
                limit: String(PAGE_SIZE),
                page: String(page),
            });
            if (contentType !== "all" && contentType !== "standalone") params.set("contentType", contentType);
            if (contentType === "standalone") params.set("projectId", "null");
            if (projectFilter !== "all") params.set("projectId", projectFilter);

            const res = await fetch(`/api/assets?${params}`);
            if (!res.ok) throw new Error("Failed to fetch images");
            const data = await res.json();

            let items: AssetRecord[] = data.assets ?? [];

            // Client-side search filter on prompt
            if (search.trim()) {
                const q = search.toLowerCase();
                items = items.filter(a => a.prompt?.toLowerCase().includes(q));
            }

            setAssets(items);
            setTotal(data.total ?? items.length);
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to load images",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [contentType, projectFilter, search, page, toast]);

    function handleSelect(id: string, sel: boolean) {
        setSelected(prev => {
            const next = new Set(prev);
            if (sel) next.add(id);
            else next.delete(id);
            return next;
        });
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Delete failed");
            setAssets(prev => prev.filter(a => a.id !== id));
            setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
            toast({ title: "Image deleted" });
        } catch (error: unknown) {
            toast({
                title: "Delete failed",
                description: error instanceof Error ? error.message : "Unknown error",
                variant: "destructive",
            });
        }
    }

    async function handleBulkDelete() {
        if (selected.size === 0) return;
        if (!confirm(`Delete ${selected.size} image(s)? This cannot be undone.`)) return;

        setBulkDeleting(true);
        let deleted = 0;
        for (const id of selected) {
            try {
                await fetch(`/api/assets/${id}`, { method: "DELETE" });
                deleted++;
            } catch { /* continue */ }
        }
        setAssets(prev => prev.filter(a => !selected.has(a.id)));
        setSelected(new Set());
        setBulkDeleting(false);
        toast({ title: `${deleted} image(s) deleted` });
    }

    function handleDownloadSelected() {
        const ids = [...selected].join(",");
        const url = `/api/assets/download?ids=${ids}`;
        window.open(url, "_blank");
    }

    function handleDownloadAll() {
        const params = new URLSearchParams({ source: "generated" });
        if (projectFilter !== "all") params.set("projectId", projectFilter);
        window.open(`/api/assets/download?${params}`, "_blank");
    }

    function handleGenerated(asset: AssetRecord) {
        setAssets(prev => [asset, ...prev]);
        setTotal(t => t + 1);
    }

    function getProjectName(projectId: string | null): string | undefined {
        if (!projectId) return undefined;
        return projects.find(p => p.id === projectId)?.title;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div className="container mx-auto py-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Image Bank</h1>
                    <p className="text-muted-foreground">{total} image{total !== 1 ? "s" : ""} across all projects</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchAssets} className="h-9">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    {selected.size > 0 && (
                        <>
                            <Button variant="outline" size="sm" onClick={handleDownloadSelected} className="h-9">
                                <Download className="h-4 w-4 mr-2" />
                                Download ({selected.size})
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                                className="h-9"
                            >
                                {bulkDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                Delete ({selected.size})
                            </Button>
                        </>
                    )}
                    <Button variant="outline" size="sm" onClick={handleDownloadAll} className="h-9">
                        <Download className="h-4 w-4 mr-2" />
                        Download All
                    </Button>
                    <Button size="sm" onClick={() => setBuilderOpen(!builderOpen)} className="h-9">
                        <Plus className="h-4 w-4 mr-2" />
                        {builderOpen ? "Hide Builder" : "New Image"}
                    </Button>
                </div>
            </div>

            <div className="flex gap-6">
                {/* Main content */}
                <div className="flex-1 min-w-0 space-y-6">
                    {/* Filters Card */}
                    <Card className="shadow-sm border-muted/60">
                        <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
                                {/* Content type pills */}
                                <div className="flex gap-1 flex-wrap">
                                    {CONTENT_TYPES.map(t => (
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

                                {/* Project filter */}
                                <Select value={projectFilter} onValueChange={setProjectFilter}>
                                    <SelectTrigger className="h-9 text-sm w-full sm:w-48 border-muted/60">
                                        <SelectValue placeholder="All projects" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All projects</SelectItem>
                                        {projects.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* Search */}
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by prompt..."
                                    className="h-9 text-sm w-full sm:w-52 border-muted/60"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Grid Card */}
                    <Card className="shadow-sm border-muted/60 overflow-hidden">
                        <CardContent className="p-6">
                            {loading ? (
                                <div className="flex items-center justify-center py-24">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            ) : assets.length === 0 ? (
                                <div className="text-center py-24 text-muted-foreground">
                                    <Images className="h-12 w-12 mx-auto mb-4 opacity-30" />
                                    <p className="font-medium text-foreground">No images yet</p>
                                    <p className="text-sm mt-1">Use the Prompt Builder to generate your first image.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 relative">
                                    {assets.map(asset => (
                                        <ImageBankCard
                                            key={asset.id}
                                            asset={asset}
                                            projectName={getProjectName(asset.project_id)}
                                            selected={selected.has(asset.id)}
                                            onSelect={handleSelect}
                                            onDelete={handleDelete}
                                            onRegenerate={(id, prompt) => {
                                                const a = assets.find(a => a.id === id);
                                                if (a) setRegenerateAsset({ ...a, prompt });
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between bg-muted/20 p-4 rounded-lg border border-muted/60 shadow-sm">
                            <p className="text-sm text-muted-foreground font-medium">Page {page} of {totalPages}</p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1}
                                    onClick={() => setPage(p => p - 1)}
                                    className="h-9"
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                    className="h-9"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Prompt Builder sidebar */}
                {builderOpen && (
                    <div className="w-80 shrink-0">
                        <Card className="shadow-sm border-muted/60 sticky top-8">
                            <CardContent className="p-4">
                                <PromptBuilder onGenerated={handleGenerated} />
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>

            {/* Regenerate Dialog */}
            {regenerateAsset && (
                <RegenerateDialog
                    asset={regenerateAsset}
                    onClose={() => setRegenerateAsset(null)}
                    onRegenerated={(newAsset) => {
                        setAssets(prev => [newAsset, ...prev]);
                        setRegenerateAsset(null);
                        toast({ title: "Image regenerated" });
                    }}
                />
            )}
        </div>
    );
}
