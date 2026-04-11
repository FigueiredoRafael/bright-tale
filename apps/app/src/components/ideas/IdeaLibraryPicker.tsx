"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
    Search,
    Library,
    Lightbulb,
    AlertTriangle,
    Check,
    Loader2,
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
    created_at: string;
    discovery_data?: string;
}

interface IdeaLibraryPickerProps {
    onSelect: (idea: LibraryIdea) => void;
    currentIdeaTitle?: string; // For similarity warning
    trigger?: React.ReactNode;
}

export default function IdeaLibraryPicker({
    onSelect,
    currentIdeaTitle,
    trigger,
}: IdeaLibraryPickerProps) {
    const [open, setOpen] = useState(false);
    const [ideas, setIdeas] = useState<LibraryIdea[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [verdictFilter, setVerdictFilter] = useState<string>("all");
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const fetchIdeas = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (verdictFilter !== "all") params.set("verdict", verdictFilter);
            if (sourceFilter !== "all") params.set("source_type", sourceFilter);
            params.set("is_public", "true");
            params.set("limit", "50");

            const res = await fetch(`/api/ideas/library?${params}`);
            const json = await res.json();
            if (json.data?.ideas) {
                setIdeas(json.data.ideas);
            }
        } catch (err) {
            console.error("Failed to fetch ideas:", err);
        } finally {
            setLoading(false);
        }
    }, [search, verdictFilter, sourceFilter]);

    useEffect(() => {
        if (open) {
            fetchIdeas();
        }
    }, [open, fetchIdeas]);

    // Debounced search
    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => {
            fetchIdeas();
        }, 300);
        return () => clearTimeout(timer);
    }, [search, open, fetchIdeas]);

    const handleSelect = (idea: LibraryIdea) => {
        setSelectedId(idea.id);
    };

    const handleConfirm = () => {
        const selected = ideas.find((i) => i.id === selectedId);
        if (selected) {
            onSelect(selected);
            setOpen(false);
            setSelectedId(null);
        }
    };

    // Check for similarity with current idea title
    const calculateSimilarity = (title1: string, title2: string): number => {
        if (!title1 || !title2) return 0;
        const s1 = title1.toLowerCase().trim();
        const s2 = title2.toLowerCase().trim();
        if (s1 === s2) return 100;

        // Simple word overlap for quick check
        const words1 = new Set(s1.split(/\s+/));
        const words2 = new Set(s2.split(/\s+/));
        const intersection = [...words1].filter((w) => words2.has(w)).length;
        const union = new Set([...words1, ...words2]).size;
        return Math.round((intersection / union) * 100);
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

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" className="gap-2">
                        <Library className="h-4 w-4" />
                        Select from Library
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5" />
                        Idea Library
                    </DialogTitle>
                    <DialogDescription>
                        Select an existing idea to use in your project
                    </DialogDescription>
                </DialogHeader>

                {/* Filters */}
                <div className="flex gap-3 py-3 border-b">
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
                    <div className="w-40">
                        <Select value={verdictFilter} onValueChange={setVerdictFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Verdict" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Verdicts</SelectItem>
                                <SelectItem value="viable">Viable</SelectItem>
                                <SelectItem value="experimental">Experimental</SelectItem>
                                <SelectItem value="weak">Weak</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="w-40">
                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                            <SelectTrigger>
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
                </div>

                {/* Ideas Grid */}
                <div className="flex-1 overflow-y-auto py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : ideas.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No ideas found in the library</p>
                            <p className="text-sm">Try adjusting your filters or add new ideas</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {ideas.map((idea) => {
                                const similarity = currentIdeaTitle
                                    ? calculateSimilarity(currentIdeaTitle, idea.title)
                                    : 0;
                                const isSelected = selectedId === idea.id;

                                return (
                                    <Card
                                        key={idea.id}
                                        className={`cursor-pointer transition-all hover:shadow-md ${isSelected
                                                ? "ring-2 ring-primary border-primary"
                                                : "hover:border-primary/50"
                                            }`}
                                        onClick={() => handleSelect(idea)}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm" title={idea.source_type}>
                                                            {getSourceIcon(idea.source_type)}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground font-mono">
                                                            {idea.idea_id}
                                                        </span>
                                                        {similarity >= 80 && (
                                                            <Badge
                                                                variant="outline"
                                                                className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                                                            >
                                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                                Similar
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <h4 className="font-medium text-sm truncate">
                                                        {idea.title}
                                                    </h4>
                                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                        {idea.core_tension}
                                                    </p>
                                                </div>
                                                {isSelected && (
                                                    <div className="flex-shrink-0">
                                                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                                            <Check className="h-4 w-4 text-primary-foreground" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-3">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-xs ${getVerdictColor(idea.verdict)}`}
                                                >
                                                    {idea.verdict}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {idea.target_audience}
                                                </span>
                                                {idea.usage_count > 0 && (
                                                    <span className="text-xs text-muted-foreground ml-auto">
                                                        Used {idea.usage_count}x
                                                    </span>
                                                )}
                                            </div>
                                            {idea.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {idea.tags.slice(0, 3).map((tag) => (
                                                        <Badge
                                                            key={tag}
                                                            variant="secondary"
                                                            className="text-xs"
                                                        >
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
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={!selectedId}>
                        Select Idea
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
