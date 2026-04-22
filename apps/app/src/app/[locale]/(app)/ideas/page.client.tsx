"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { IdeaImportModal } from "@/components/import/IdeaImportModal";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Search,
    Lightbulb,
    Plus,
    Trash,
    Pencil,
    Upload,
    Loader2,
    AlertTriangle,
    LayoutGrid,
    List,
    Download,
    Archive,
} from "lucide-react";

interface LibraryIdea {
    id: string;
    idea_id: string;
    title: string;
    core_tension: string;
    target_audience: string;
    verdict: string;
    source_type: string;
    tags: string[];
    usage_count: number;
    is_public: boolean;
    created_at: string;
    updated_at: string;
}

export default function IdeasPage() {
    const { toast } = useToast();
    const params = useParams<{ locale: string }>();
    const locale = params.locale || 'en';
    const [ideas, setIdeas] = useState<LibraryIdea[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [verdictFilter, setVerdictFilter] = useState<string>("all");
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

    // Edit modal state
    const [editingIdea, setEditingIdea] = useState<LibraryIdea | null>(null);
    const [editForm, setEditForm] = useState({
        title: "",
        core_tension: "",
        target_audience: "",
        verdict: "experimental",
        tags: "",
    });
    const [saving, setSaving] = useState(false);

    // Create modal state
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({
        title: "",
        core_tension: "",
        target_audience: "",
        verdict: "experimental",
        tags: "",
    });

    // Delete confirmation
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // View mode + multi-select
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Prevent duplicate fetches
    const fetchingRef = useRef(false);
    const mountedRef = useRef(false);

    // Single fetch function
    const fetchIdeas = useCallback(async (resetPage = false) => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        setLoading(true);

        const currentPage = resetPage ? 1 : page;
        if (resetPage && page !== 1) {
            setPage(1);
        }

        try {
            const params = new URLSearchParams();
            if (debouncedSearch) params.set("search", debouncedSearch);
            if (verdictFilter !== "all") params.set("verdict", verdictFilter);
            if (sourceFilter !== "all") params.set("source_type", sourceFilter);
            params.set("page", String(currentPage));
            params.set("limit", "20");

            const res = await fetch(`/api/ideas/library?${params}`);
            const json = await res.json();
            if (json.data) {
                setIdeas(json.data.ideas || []);
                setTotalPages(json.data.pagination?.totalPages || 0);
            }
        } catch {
            toast({ title: "Failed to fetch ideas", variant: "destructive" });
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [debouncedSearch, verdictFilter, sourceFilter, page, toast]);

    // Initial fetch only
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            fetchIdeas();
        }
    }, [fetchIdeas]);

    // Debounced search
    useEffect(() => {
        if (!mountedRef.current) return;
        const timer = setTimeout(() => {
            if (search !== debouncedSearch) {
                setDebouncedSearch(search);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [search, debouncedSearch]);

    // Fetch when filters change (after mount)
    useEffect(() => {
        if (mountedRef.current) {
            fetchIdeas(true);
        }
    }, [debouncedSearch, verdictFilter, sourceFilter]);

    // Fetch when page changes (not filter-triggered)
    useEffect(() => {
        if (mountedRef.current && page > 1) {
            fetchIdeas();
        }
    }, [page]);

    const handleCreate = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/ideas/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: createForm.title,
                    core_tension: createForm.core_tension,
                    target_audience: createForm.target_audience,
                    verdict: createForm.verdict,
                    source_type: "manual",
                    tags: createForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
                }),
            });

            if (!res.ok) throw new Error("Failed to create");

            const json = await res.json();
            if (json.data?.warnings?.length > 0) {
                toast({
                    title: "Idea created with warnings",
                    description: "Similar ideas exist in the library",
                });
            } else {
                toast({ title: "Idea created successfully" });
            }

            setShowCreate(false);
            setCreateForm({ title: "", core_tension: "", target_audience: "", verdict: "experimental", tags: "" });
            fetchIdeas();
        } catch (err) {
            toast({ title: "Failed to create idea", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = async () => {
        if (!editingIdea) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/ideas/library/${editingIdea.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: editForm.title,
                    core_tension: editForm.core_tension,
                    target_audience: editForm.target_audience,
                    verdict: editForm.verdict,
                    tags: editForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
                }),
            });

            if (!res.ok) throw new Error("Failed to update");

            toast({ title: "Idea updated successfully" });
            setEditingIdea(null);
            fetchIdeas();
        } catch (err) {
            toast({ title: "Failed to update idea", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/ideas/library/${id}`, {
                method: "DELETE",
            });

            if (!res.ok) throw new Error("Failed to delete");

            toast({ title: "Idea deleted successfully" });
            setDeletingId(null);
            fetchIdeas();
        } catch (err) {
            toast({ title: "Failed to delete idea", variant: "destructive" });
        }
    };

    const openEditModal = (idea: LibraryIdea) => {
        setEditingIdea(idea);
        setEditForm({
            title: idea.title,
            core_tension: idea.core_tension,
            target_audience: idea.target_audience,
            verdict: idea.verdict,
            tags: (idea.tags || []).join(", "),
        });
    };

    const [showImport, setShowImport] = useState(false);

    const handleBulkImport = async (ideas: Array<{ title: string; core_tension: string; target_audience: string; verdict: string; tags: string[]; source_type: string }>) => {
        let imported = 0;
        let failed = 0;
        for (const idea of ideas) {
            try {
                const res = await fetch("/api/ideas/library", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(idea),
                });
                if (res.ok) imported++; else failed++;
            } catch {
                failed++;
            }
        }
        fetchIdeas();
        return { imported, failed };
    };

    const getVerdictColor = (verdict: string) => {
        switch (verdict) {
            case "viable":
                return "bg-success/10 text-success border-success/20";
            case "experimental":
                return "bg-warning/10 text-warning border-warning/20";
            case "weak":
                return "bg-destructive/5 text-destructive border-destructive/20";
            default:
                return "bg-muted text-foreground border-border";
        }
    };

    const getSourceIcon = (source: string) => {
        switch (source) {
            case "brainstorm":
                return "🧠";
            case "import":
                return "📥";
            case "manual":
                return "✏️";
            default:
                return "📄";
        }
    };

    // Track last clicked index for shift-select range
    const lastClickedRef = useRef<number>(-1);

    const handleSelect = (id: string, index: number, event?: React.MouseEvent) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);

            if (event?.shiftKey && lastClickedRef.current >= 0) {
                // Shift+click: select range between last click and current
                const start = Math.min(lastClickedRef.current, index);
                const end = Math.max(lastClickedRef.current, index);
                for (let i = start; i <= end; i++) {
                    next.add(ideas[i].id);
                }
            } else if (event?.ctrlKey || event?.metaKey) {
                // Ctrl/Cmd+click: toggle single without clearing others
                if (next.has(id)) next.delete(id); else next.add(id);
            } else {
                // Plain click on checkbox: toggle single
                if (next.has(id)) next.delete(id); else next.add(id);
            }

            return next;
        });
        lastClickedRef.current = index;
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === ideas.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(ideas.map((i) => i.id)));
        }
    };

    const [batchDeleting, setBatchDeleting] = useState(false);

    const handleBatchDelete = async () => {
        setBatchDeleting(true);
        const ids = Array.from(selectedIds);
        for (const id of ids) {
            await fetch(`/api/ideas/library/${id}`, { method: "DELETE" });
        }
        toast({ title: `${ids.length} ideas deleted` });
        setSelectedIds(new Set());
        setBatchDeleting(false);
        fetchIdeas();
    };

    const handleBatchExport = () => {
        const selected = ideas.filter((i) => selectedIds.has(i.id));
        const json = JSON.stringify(selected, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ideas-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: `${selected.length} ideas exported` });
    };


    const handleBatchVerdictChange = async (newVerdict: string) => {
        const ids = Array.from(selectedIds);
        for (const id of ids) {
            await fetch(`/api/ideas/library/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ verdict: newVerdict }),
            });
        }
        toast({ title: `${ids.length} ideas marked as ${newVerdict}` });
        setSelectedIds(new Set());
        fetchIdeas();
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-heading-md flex items-center gap-2">
                        <Lightbulb className="h-6 w-6" />
                        Idea Library
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Browse and manage your global idea collection
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => setShowImport(true)}>
                        <Upload className="h-4 w-4" />
                        Import
                    </Button>
                    <Button onClick={() => setShowCreate(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Idea
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-6">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search ideas..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </div>
                <Select value={verdictFilter} onValueChange={setVerdictFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Verdict" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Verdicts</SelectItem>
                        <SelectItem value="viable">Viable</SelectItem>
                        <SelectItem value="experimental">Experimental</SelectItem>
                        <SelectItem value="weak">Weak</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        <SelectItem value="brainstorm">Brainstorm</SelectItem>
                        <SelectItem value="import">Imported</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex border rounded-md">
                    <Button
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="sm"
                        className="rounded-r-none h-9 px-2.5"
                        onClick={() => setViewMode("grid")}
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewMode === "list" ? "default" : "ghost"}
                        size="sm"
                        className="rounded-l-none h-9 px-2.5"
                        onClick={() => setViewMode("list")}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Batch Action Toolbar */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 mb-4 p-3 bg-muted/50 rounded-lg border">
                    <Checkbox
                        checked={selectedIds.size === ideas.length}
                        onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-sm font-medium">
                        {selectedIds.size} selected
                    </span>
                    <div className="flex gap-2 ml-auto">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBatchExport}>
                            <Download className="h-3.5 w-3.5" />
                            Export JSON
                        </Button>
                        <Select onValueChange={handleBatchVerdictChange}>
                            <SelectTrigger className="w-36 h-8 text-xs">
                                <SelectValue placeholder="Change verdict" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="viable">Mark Viable</SelectItem>
                                <SelectItem value="experimental">Mark Experimental</SelectItem>
                                <SelectItem value="weak">Mark Weak</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleBatchDelete} disabled={batchDeleting}>
                            {batchDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash className="h-3.5 w-3.5" />}
                            {batchDeleting ? "Deleting..." : `Delete (${selectedIds.size})`}
                        </Button>
                    </div>
                </div>
            )}

            {/* Ideas Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : ideas.length === 0 ? (
                <div className="text-center py-12">
                    <Lightbulb className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No ideas yet</h3>
                    <p className="text-muted-foreground mt-1">
                        Create your first idea or import from markdown
                    </p>
                </div>
            ) : (
                <>
                    {viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {ideas.map((idea, idx) => (
                            <Card
                                key={idea.id}
                                className={`hover:shadow-md transition-shadow cursor-pointer ${selectedIds.has(idea.id) ? "ring-2 ring-primary" : ""}`}
                                onClick={(e) => {
                                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                        e.preventDefault();
                                        handleSelect(idea.id, idx, e);
                                    }
                                }}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                checked={selectedIds.has(idea.id)}
                                                onClick={(e) => { e.stopPropagation(); handleSelect(idea.id, idx, e as unknown as React.MouseEvent); }}
                                                onCheckedChange={() => {/* handled by onClick */}}
                                            />
                                            <span title={idea.source_type}>{getSourceIcon(idea.source_type)}</span>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {idea.idea_id}
                                            </span>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={(e) => { e.stopPropagation(); openEditModal(idea); }}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 text-destructive hover:text-destructive/80"
                                                onClick={(e) => { e.stopPropagation(); setDeletingId(idea.id); }}
                                            >
                                                <Trash className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <Link href={`/${locale}/ideas/${idea.id}`} className="block hover:underline">
                                        <CardTitle className="text-sm font-medium leading-tight">
                                            {idea.title}
                                        </CardTitle>
                                    </Link>
                                </CardHeader>
                                <CardContent>
                                    <Link href={`/${locale}/ideas/${idea.id}`} className="block">
                                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 hover:underline">
                                            {idea.core_tension}
                                        </p>
                                    </Link>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge
                                            variant="outline"
                                            className={`text-xs ${getVerdictColor(idea.verdict)}`}
                                        >
                                            {idea.verdict}
                                        </Badge>
                                        {idea.target_audience && (
                                            <span className="text-xs text-muted-foreground truncate max-w-30">
                                                {idea.target_audience}
                                            </span>
                                        )}
                                        {idea.usage_count > 0 && (
                                            <span className="text-xs text-muted-foreground ml-auto">
                                                Used {idea.usage_count}x
                                            </span>
                                        )}
                                    </div>
                                    {idea.tags && idea.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {idea.tags.slice(0, 3).map((tag) => (
                                                <Badge key={tag} variant="secondary" className="text-xs">
                                                    {tag}
                                                </Badge>
                                            ))}
                                            {idea.tags.length > 3 && (
                                                <span className="text-xs text-muted-foreground">
                                                    +{idea.tags.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    ) : (
                    /* List View */
                    <div className="border rounded-lg divide-y">
                        {/* List header */}
                        <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                            <Checkbox
                                checked={ideas.length > 0 && selectedIds.size === ideas.length}
                                onCheckedChange={toggleSelectAll}
                            />
                            <span className="w-24">ID</span>
                            <span className="flex-1">Title</span>
                            <span className="w-48 hidden lg:block">Audience</span>
                            <span className="w-24 text-center">Verdict</span>
                            <span className="w-20 text-center">Source</span>
                            <span className="w-20 text-right">Actions</span>
                        </div>
                        {ideas.map((idea, idx) => (
                            <Link
                                key={idea.id}
                                href={`/${locale}/ideas/${idea.id}`}
                                className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer select-none ${selectedIds.has(idea.id) ? "bg-primary/5" : ""}`}
                                onClick={(e) => {
                                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                        e.preventDefault();
                                        handleSelect(idea.id, idx, e as unknown as React.MouseEvent);
                                    }
                                }}
                            >
                                <Checkbox
                                    checked={selectedIds.has(idea.id)}
                                    onClick={(e) => { e.stopPropagation(); handleSelect(idea.id, idx, e as unknown as React.MouseEvent); }}
                                    onCheckedChange={() => {/* handled by onClick */}}
                                />
                                <span className="text-xs text-muted-foreground font-mono w-24 shrink-0">
                                    {idea.idea_id}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{idea.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{idea.core_tension}</p>
                                </div>
                                <span className="w-48 text-xs text-muted-foreground truncate hidden lg:block">
                                    {idea.target_audience}
                                </span>
                                <div className="w-24 flex justify-center">
                                    <Badge
                                        variant="outline"
                                        className={`text-xs ${getVerdictColor(idea.verdict)}`}
                                    >
                                        {idea.verdict}
                                    </Badge>
                                </div>
                                <span className="w-20 text-center" title={idea.source_type}>
                                    {getSourceIcon(idea.source_type)}
                                </span>
                                <div className="w-20 flex justify-end gap-1" onClick={(e) => e.preventDefault()}>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={(e) => { e.stopPropagation(); openEditModal(idea); }}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-destructive hover:text-destructive/80"
                                        onClick={(e) => { e.stopPropagation(); setDeletingId(idea.id); }}
                                    >
                                        <Trash className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </Link>
                        ))}
                    </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-6">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() => setPage((prev) => prev - 1)}
                            >
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {page} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= totalPages}
                                onClick={() => setPage((prev) => prev + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </>
            )}

            {/* Create Modal */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Idea</DialogTitle>
                        <DialogDescription>
                            Add a new idea to your global library
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Title *</Label>
                            <Input
                                value={createForm.title}
                                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                                placeholder="Your idea title"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Core Tension / One-liner</Label>
                            <Textarea
                                value={createForm.core_tension}
                                onChange={(e) => setCreateForm({ ...createForm, core_tension: e.target.value })}
                                placeholder="What problem does this idea solve?"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Target Audience</Label>
                            <Input
                                value={createForm.target_audience}
                                onChange={(e) => setCreateForm({ ...createForm, target_audience: e.target.value })}
                                placeholder="Who is this for?"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Verdict</Label>
                            <Select
                                value={createForm.verdict}
                                onValueChange={(v) => setCreateForm({ ...createForm, verdict: v })}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="viable">Viable</SelectItem>
                                    <SelectItem value="experimental">Experimental</SelectItem>
                                    <SelectItem value="weak">Weak</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Tags (comma-separated)</Label>
                            <Input
                                value={createForm.tags}
                                onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })}
                                placeholder="seo, content, tutorial"
                                className="mt-1"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowCreate(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={!createForm.title || saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Create
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog open={!!editingIdea} onOpenChange={(open) => !open && setEditingIdea(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Idea</DialogTitle>
                        <DialogDescription>Update idea details</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Title *</Label>
                            <Input
                                value={editForm.title}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Core Tension / One-liner</Label>
                            <Textarea
                                value={editForm.core_tension}
                                onChange={(e) => setEditForm({ ...editForm, core_tension: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Target Audience</Label>
                            <Input
                                value={editForm.target_audience}
                                onChange={(e) => setEditForm({ ...editForm, target_audience: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Verdict</Label>
                            <Select
                                value={editForm.verdict}
                                onValueChange={(v) => setEditForm({ ...editForm, verdict: v })}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="viable">Viable</SelectItem>
                                    <SelectItem value="experimental">Experimental</SelectItem>
                                    <SelectItem value="weak">Weak</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Tags (comma-separated)</Label>
                            <Input
                                value={editForm.tags}
                                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditingIdea(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEdit} disabled={!editForm.title || saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Save Changes
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Import Modal */}
            <IdeaImportModal
                open={showImport}
                onOpenChange={setShowImport}
                onImport={handleBulkImport}
            />

            {/* Delete Confirmation */}
            <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            Delete Idea
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this idea? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setDeletingId(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deletingId && handleDelete(deletingId)}
                        >
                            Delete
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
