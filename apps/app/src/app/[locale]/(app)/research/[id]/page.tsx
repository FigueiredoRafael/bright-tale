"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ResearchStats,
    SourcesTable,
    LinkedProjectsList,
    SourceForm,
    CreateProjectModal,
    ResearchContentDisplay,
} from "@/components/research";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    ArrowLeft,
    Plus,
    Pencil,
    Trash2,
    AlertCircle,
    RefreshCcw,
    Link2,
    Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchResearchDetail, deleteResearch, type ResearchWithRelations } from "@/lib/api/research";

export default function ResearchDetailPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const id = params.id as string;

    const [research, setResearch] = useState<ResearchWithRelations | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [sourceFormOpen, setSourceFormOpen] = useState(false);
    const [createProjectOpen, setCreateProjectOpen] = useState(false);

    // Link to Idea state
    const [linkIdeaOpen, setLinkIdeaOpen] = useState(false);
    const [ideaSearch, setIdeaSearch] = useState("");
    const [ideas, setIdeas] = useState<Array<{ id: string; title: string; core_tension: string }>>([]);
    const [loadingIdeas, setLoadingIdeas] = useState(false);
    const [linkingIdea, setLinkingIdea] = useState(false);

    useEffect(() => {
        fetchResearch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchResearch = async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await fetchResearchDetail(id);
            setResearch(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load research");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);

        try {
            await deleteResearch(id);

            toast({
                title: "Research deleted",
                description: "The research entry has been permanently deleted.",
            });

            router.push("/research");
        } catch (err) {
            toast({
                variant: "destructive",
                title: "Error",
                description: err instanceof Error ? err.message : "Failed to delete research",
            });
        } finally {
            setDeleting(false);
            setDeleteDialogOpen(false);
        }
    };

    const handleSourceUpdate = () => {
        fetchResearch();
    };

    // Search for ideas to link
    const searchIdeas = async () => {
        if (!ideaSearch.trim()) return;

        setLoadingIdeas(true);
        try {
            const res = await fetch(`/api/ideas/library?search=${encodeURIComponent(ideaSearch)}&limit=10`);
            if (res.ok) {
                const json = await res.json();
                setIdeas(json.data?.ideas || []);
            }
        } catch (err) {
            console.error("Failed to search ideas:", err);
        } finally {
            setLoadingIdeas(false);
        }
    };

    // Link research to an idea by updating the research_content
    const linkToIdea = async (ideaId: string, ideaTitle: string) => {
        setLinkingIdea(true);
        try {
            // Get current research content and add idea_id
            let newContent = research?.research_content || "{}";
            try {
                const parsed = JSON.parse(newContent);
                parsed.idea_id = ideaId;
                parsed.linked_idea_title = ideaTitle;
                newContent = JSON.stringify(parsed, null, 2);
            } catch {
                newContent = JSON.stringify({
                    idea_id: ideaId,
                    linked_idea_title: ideaTitle,
                    original_content: newContent,
                });
            }

            const res = await fetch(`/api/research/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ research_content: newContent }),
            });

            if (res.ok) {
                toast({ title: "Linked to idea", description: `Research linked to "${ideaTitle}"` });
                setLinkIdeaOpen(false);
                fetchResearch();
            } else {
                throw new Error("Failed to link");
            }
        } catch (err) {
            toast({ variant: "destructive", title: "Error", description: "Failed to link research to idea" });
        } finally {
            setLinkingIdea(false);
        }
    };

    // Loading State
    if (loading) {
        return (
            <div className="container mx-auto py-8 px-4">
                <Skeleton className="h-8 w-32 mb-6" />
                <Skeleton className="h-12 w-2/3 mb-4" />
                <Skeleton className="h-6 w-1/3 mb-8" />
                <Skeleton className="h-64 w-full mb-8" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    // 404 State
    if (error === "Research not found") {
        return (
            <div className="container mx-auto py-16 px-4">
                <div className="text-center">
                    <div className="text-6xl mb-4">🔍</div>
                    <h1 className="text-3xl font-bold mb-2">Research Not Found</h1>
                    <p className="text-muted-foreground mb-6">
                        The research entry you&apos;re looking for doesn&apos;t exist or has been deleted.
                    </p>
                    <Button onClick={() => router.push("/research")}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Library
                    </Button>
                </div>
            </div>
        );
    }

    // Error State
    if (error || !research) {
        return (
            <div className="container mx-auto py-8 px-4">
                <Alert variant="destructive" className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                        <span>{error || "Failed to load research"}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchResearch}
                            className="ml-4"
                        >
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
                <Button variant="outline" onClick={() => router.push("/research")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Library
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4">
            {/* Header */}
            <div className="mb-8">
                <Button
                    variant="ghost"
                    onClick={() => router.push("/research")}
                    className="mb-4"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Library
                </Button>

                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-4xl font-bold">{research.title}</h1>
                            {research.theme && (
                                <Badge variant="secondary" className="text-base">
                                    {research.theme}
                                </Badge>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLinkIdeaOpen(true)}
                        >
                            <Link2 className="h-4 w-4 mr-2" />
                            Link to Idea
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/research/${id}/edit`)}
                        >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteDialogOpen(true)}
                        >
                            <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                            Delete
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="mt-6">
                    <ResearchStats
                        winners_count={research.winners_count}
                        projects_count={research.projects_count}
                        created_at={research.created_at}
                        updated_at={research.updated_at}
                    />
                </div>
            </div>

            <Separator className="my-8" />

            {/* Research Content */}
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Research Content</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResearchContentDisplay content={research.research_content} />
                </CardContent>
            </Card>

            {/* Sources Section */}
            <Card className="mb-8">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Sources</CardTitle>
                            <CardDescription>
                                Reference materials used in this research
                            </CardDescription>
                        </div>
                        <Button onClick={() => setSourceFormOpen(true)} size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Source
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <SourcesTable
                        researchId={id}
                        sources={research.sources}
                        onUpdate={handleSourceUpdate}
                    />
                </CardContent>
            </Card>

            {/* Linked Projects Section */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Linked Projects</CardTitle>
                            <CardDescription>
                                Projects derived from this research
                            </CardDescription>
                        </div>
                        <Button onClick={() => setCreateProjectOpen(true)} size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Create Project
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <LinkedProjectsList projects={research.projects} />
                </CardContent>
            </Card>

            {/* Add Source Modal */}
            <SourceForm
                researchId={id}
                open={sourceFormOpen}
                onOpenChange={setSourceFormOpen}
                onSuccess={handleSourceUpdate}
            />

            {/* Create Project Modal */}
            <CreateProjectModal
                researchId={id}
                researchTitle={research.title}
                researchTheme={research.theme}
                open={createProjectOpen}
                onOpenChange={setCreateProjectOpen}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Research</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{research.title}&quot;? This
                            will also delete all associated sources. Projects will remain but
                            will be unlinked. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Link to Idea Modal */}
            <Dialog open={linkIdeaOpen} onOpenChange={setLinkIdeaOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5" />
                            Link to Idea
                        </DialogTitle>
                        <DialogDescription>
                            Search for an idea from your library to link this research to.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex gap-2">
                            <Input
                                placeholder="Search ideas..."
                                value={ideaSearch}
                                onChange={(e) => setIdeaSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && searchIdeas()}
                            />
                            <Button onClick={searchIdeas} disabled={loadingIdeas}>
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto space-y-2">
                            {loadingIdeas && <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>}
                            {!loadingIdeas && ideas.length === 0 && ideaSearch && (
                                <p className="text-sm text-muted-foreground text-center py-4">No ideas found</p>
                            )}
                            {ideas.map((idea) => (
                                <Card
                                    key={idea.id}
                                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                                    onClick={() => linkToIdea(idea.id, idea.title)}
                                >
                                    <CardContent className="p-3">
                                        <p className="font-medium text-sm">{idea.title}</p>
                                        <p className="text-xs text-muted-foreground line-clamp-2">{idea.core_tension}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLinkIdeaOpen(false)} disabled={linkingIdea}>
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
