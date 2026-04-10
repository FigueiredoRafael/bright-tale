"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
import MarkdownImport from "@/components/import/MarkdownImport";
import type { ParsedIdea } from "@/lib/parsers/markdown";
import {
    Search,
    Lightbulb,
    Plus,
    Trash,
    Pencil,
    Upload,
    Loader2,
    AlertTriangle,
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

    const handleImport = async (parsed: ParsedIdea) => {
        setSaving(true);
        try {
            const res = await fetch("/api/ideas/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: parsed.title,
                    core_tension: parsed.one_liner,
                    target_audience: "",
                    verdict: "experimental",
                    source_type: "import",
                    markdown_content: parsed.raw_content,
                }),
            });

            if (!res.ok) throw new Error("Failed to import");

            toast({ title: "Idea imported successfully" });
            fetchIdeas();
        } catch (err) {
            toast({ title: "Failed to import idea", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const getVerdictColor = (verdict: string) => {
        switch (verdict) {
            case "viable":
                return "bg-green-100 text-green-800 border-green-200";
            case "experimental":
                return "bg-yellow-100 text-yellow-800 border-yellow-200";
            case "weak":
                return "bg-red-100 text-red-800 border-red-200";
            default:
                return "bg-gray-100 text-gray-800 border-gray-200";
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

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <Lightbulb className="h-6 w-6" />
                        Idea Library
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Browse and manage your global idea collection
                    </p>
                </div>
                <div className="flex gap-2">
                    <MarkdownImport
                        type="idea"
                        saveToLibrary={true}
                        onImport={(parsed) => handleImport(parsed as ParsedIdea)}
                        trigger={
                            <Button variant="outline" className="gap-2">
                                <Upload className="h-4 w-4" />
                                Import
                            </Button>
                        }
                    />
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
            </div>

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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {ideas.map((idea) => (
                            <Card key={idea.id} className="hover:shadow-md transition-shadow">
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
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
                                                onClick={() => openEditModal(idea)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                                onClick={() => setDeletingId(idea.id)}
                                            >
                                                <Trash className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <CardTitle className="text-sm font-medium leading-tight">
                                        {idea.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                                        {idea.core_tension}
                                    </p>
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

            {/* Delete Confirmation */}
            <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
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
