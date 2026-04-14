"use client";

import { useEffect, useState } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import StageTracker, { STAGE_ORDER } from "@/components/projects/StageTracker";
import BrainstormForm from "@/components/brainstorm/BrainstormForm";
import ResearchForm from "@/components/research/ResearchForm";
import ProductionForm from "@/components/production/ProductionForm";
import ReviewForm from "@/components/review/ReviewForm";
import PublishingForm from "@/components/wordpress/PublishingForm";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, ExternalLink, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import yaml from "js-yaml";

// Map legacy stage names to new ones
const normalizeStage = (stage: string): string => {
    const legacyMap: Record<string, string> = {
        discovery: "brainstorm",
        content: "production",
        publication: "publish",
    };
    return legacyMap[stage] || stage;
};

interface Project {
    id: string;
    title: string;
    status: string;
    current_stage: string;
    auto_advance: boolean;
    completed_stages?: string[];
    research_id?: string | null;
    research?: {
        id: string;
        title: string;
    } | null;
}

export default function FocusedProjectView() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"form" | "yaml">("form");
    const [navigating, setNavigating] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState("");
    const { toast } = useToast();

    // Normalized current stage
    const currentStage = project ? normalizeStage(project.current_stage) : "brainstorm";
    const completedStages = project?.completed_stages || [];

    useEffect(() => {
        if (!id) return;
        fetchProject();
    }, [id]);

    // Autosave every 30s if content changed
    useEffect(() => {
        if (!content || content.length < 10 || !project) return;

        const timer = setTimeout(() => {
            saveStage(content, false);
        }, 30000);

        return () => clearTimeout(timer);
    }, [content]);

    const fetchProject = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${id}`);
            if (!res.ok) throw new Error("Failed to fetch project");
            const json = await res.json();
            setProject(json.data);

            // Load current stage content (use normalized stage)
            const stageType = normalizeStage(json.data.current_stage) || "brainstorm";
            const stageRes = await fetch(`/api/stages/${id}/${stageType}`);
            if (stageRes.ok) {
                const stageJson = await stageRes.json();
                setContent(stageJson.data?.stage?.yaml_artifact ?? "");
            }
        } catch (err) {
            toast({ title: "Failed to load project", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const saveStage = async (yamlContent: string, showToast = true) => {
        if (!project) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/stages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project_id: id,
                    stage_type: currentStage,
                    yaml_artifact: yamlContent,
                }),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error?.message || "Failed to save stage");
            }
            setContent(yamlContent);
            setLastSaved(new Date().toISOString());
            if (showToast) toast({ title: "Saved" });
        } catch (err) {
            toast({
                title: "Failed to save",
                description: err instanceof Error ? err.message : "Unknown error",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const advanceToNextStage = async () => {
        if (!project) return;

        const currentIndex = STAGE_ORDER.indexOf(currentStage);
        if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) {
            toast({ title: "Workflow Complete!", description: "All stages finished." });
            return;
        }

        const nextStage = STAGE_ORDER[currentIndex + 1];

        try {
            // Mark current stage as completed
            const updatedCompleted = [...completedStages];
            if (!updatedCompleted.includes(currentStage)) {
                updatedCompleted.push(currentStage);
            }

            const res = await fetch(`/api/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    current_stage: nextStage,
                    completed_stages: updatedCompleted,
                }),
            });

            if (!res.ok) throw new Error("Failed to advance");

            const json = await res.json();
            setProject(json.data);
            setContent(""); // Clear content for new stage
            toast({ title: `Advanced to ${nextStage}`, description: "Stage updated successfully." });
        } catch (err) {
            toast({ title: "Failed to advance stage", variant: "destructive" });
        }
    };

    // Navigate to any stage with auto-save
    const navigateToStage = async (targetStage: string) => {
        if (!project || targetStage === currentStage) return;

        // Check if navigation is allowed
        const canNavigate = checkCanNavigate(targetStage);
        if (!canNavigate.allowed) {
            toast({
                title: "Cannot navigate to stage",
                description: canNavigate.reason,
                variant: "destructive"
            });
            return;
        }

        setNavigating(true);
        try {
            // Auto-save current content before navigating
            if (content && content.trim().length > 0) {
                const saveRes = await fetch(`/api/stages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        project_id: id,
                        stage_type: currentStage,
                        yaml_artifact: content,
                    }),
                });
                if (!saveRes.ok) {
                    const error = await saveRes.json();
                    throw new Error(`Failed to save before navigating: ${error.error?.message || "Unknown error"}`);
                }
            }

            // Update current stage
            const res = await fetch(`/api/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_stage: targetStage }),
            });

            if (!res.ok) throw new Error("Failed to navigate");

            const json = await res.json();
            setProject(json.data);

            // Fetch target stage content
            const stageRes = await fetch(`/api/stages/${id}/${targetStage}`);
            if (stageRes.ok) {
                const stageJson = await stageRes.json();
                setContent(stageJson.data?.stage?.yaml_artifact ?? "");
            } else {
                setContent("");
            }

            toast({ title: `Navigated to ${targetStage}` });
        } catch (err) {
            toast({ title: "Failed to navigate", variant: "destructive" });
        } finally {
            setNavigating(false);
        }
    };

    // Check if navigation to a stage is allowed
    const checkCanNavigate = (targetStage: string): { allowed: boolean; reason?: string } => {
        // Always allow going back to earlier stages
        const targetIndex = STAGE_ORDER.indexOf(targetStage);
        const currentIndex = STAGE_ORDER.indexOf(currentStage);

        if (targetIndex <= currentIndex) {
            return { allowed: true };
        }

        // Check skip rules for forward navigation
        switch (targetStage) {
            case "brainstorm":
            case "research":
            case "production":
                // These can be skipped if user has content (library selection or import)
                return { allowed: true };
            case "review":
                // Locked - requires production completed
                if (!completedStages.includes("production")) {
                    return {
                        allowed: false,
                        reason: "Complete the Production stage first"
                    };
                }
                return { allowed: true };
            case "publish":
                // Locked - requires both production and review
                if (!completedStages.includes("production") || !completedStages.includes("review")) {
                    return {
                        allowed: false,
                        reason: "Complete both Production and Review stages first"
                    };
                }
                return { allowed: true };
            default:
                return { allowed: false, reason: "Unknown stage" };
        }
    };

    const completeStageAndAdvance = async (yamlContent: string) => {
        await saveStage(yamlContent, false);

        if (project?.auto_advance) {
            await advanceToNextStage();
        } else {
            toast({
                title: "Stage Saved",
                description: "Auto-advance is off. Click 'Next Stage' to continue."
            });
        }
    };

    const toggleAutoAdvance = async () => {
        if (!project) return;
        try {
            const res = await fetch(`/api/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auto_advance: !project.auto_advance }),
            });
            if (!res.ok) throw new Error("Failed to update");
            const json = await res.json();
            setProject(json.data);
            toast({ title: `Auto-advance ${!project.auto_advance ? "enabled" : "disabled"}` });
        } catch (err) {
            toast({ title: "Failed to update", variant: "destructive" });
        }
    };

    const saveTitle = async () => {
        if (!project || !titleInput.trim()) {
            setEditingTitle(false);
            return;
        }
        try {
            const res = await fetch(`/api/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: titleInput.trim() }),
            });
            if (!res.ok) throw new Error("Failed to update title");
            const json = await res.json();
            setProject(json.data);
            setEditingTitle(false);
            toast({ title: "Title updated" });
        } catch (err) {
            toast({ title: "Failed to update title", variant: "destructive" });
        }
    };

    if (loading) return <div className="p-6">Loading...</div>;
    if (!project) return <div className="p-6">Project not found</div>;

    const currentStageIndex = STAGE_ORDER.indexOf(project.current_stage);
    const isLastStage = currentStageIndex === STAGE_ORDER.length - 1;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    {editingTitle ? (
                        <div className="flex items-center gap-2">
                            <Input
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                className="text-2xl font-semibold h-auto py-1 w-80"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") saveTitle();
                                    if (e.key === "Escape") setEditingTitle(false);
                                }}
                            />
                            <Button size="sm" variant="ghost" onClick={saveTitle}>
                                <Check className="h-4 w-4 text-success" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>
                                <X className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group">
                            <h1 className="text-heading-md">{project.title}</h1>
                            <button
                                onClick={() => {
                                    setTitleInput(project.title);
                                    setEditingTitle(true);
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                            >
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </div>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm text-muted-foreground">Status: {project.status}</p>
                        {project.research && (
                            <Link href={`/research/${project.research.id}`}>
                                <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-accent">
                                    <BookOpen className="h-3 w-3" />
                                    Linked Research
                                    <ExternalLink className="h-3 w-3" />
                                </Badge>
                            </Link>
                        )}
                        {project.research_id && !project.research && (
                            <Badge variant="destructive" className="gap-1">
                                <BookOpen className="h-3 w-3" />
                                Research Deleted
                                <button
                                    onClick={async () => {
                                        try {
                                            await fetch(`/api/projects/${id}`, {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ research_id: null }),
                                            });
                                            setProject({ ...project, research_id: null });
                                            toast({ title: "Reference cleared" });
                                        } catch {
                                            toast({ title: "Failed to clear reference", variant: "destructive" });
                                        }
                                    }}
                                    className="ml-1 underline text-xs"
                                >
                                    Clear
                                </button>
                            </Badge>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">Auto-advance:</span>
                        <button
                            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${project.auto_advance
                                ? "bg-success/10 text-success"
                                : "bg-muted text-muted-foreground"
                                }`}
                            onClick={toggleAutoAdvance}
                        >
                            {project.auto_advance ? "On" : "Off"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Stage Tracker */}
            <div className="mb-6">
                {navigating && (
                    <div className="mb-2 text-sm text-muted-foreground">
                        Navigating...
                    </div>
                )}
                <StageTracker
                    currentStage={currentStage}
                    completedStages={completedStages}
                    onNavigate={navigateToStage}
                />
            </div>

            {/* Stage Content */}
            <div className="bg-card border rounded-lg">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-medium capitalize">
                        {currentStage} Stage
                    </h2>
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "form" | "yaml")}>
                        <TabsList>
                            <TabsTrigger value="form">Form</TabsTrigger>
                            <TabsTrigger value="yaml">YAML</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                <div className="p-4">
                    {viewMode === "form" ? (
                        <>
                            {currentStage === "brainstorm" && (
                                <BrainstormForm
                                    initialYaml={content}
                                    onSave={(yaml) => saveStage(yaml)}
                                    onComplete={completeStageAndAdvance}
                                    saving={saving}
                                />
                            )}
                            {currentStage === "research" && (
                                <ResearchForm
                                    initialYaml={content}
                                    projectId={id}
                                    onSave={(yaml) => saveStage(yaml)}
                                    onComplete={completeStageAndAdvance}
                                    saving={saving}
                                />
                            )}
                            {currentStage === "production" && (
                                <ProductionForm
                                    initialYaml={content}
                                    projectId={id}
                                    onSave={(yaml) => saveStage(yaml)}
                                    onComplete={completeStageAndAdvance}
                                    saving={saving}
                                />
                            )}
                            {currentStage === "review" && (
                                <ReviewForm
                                    initialYaml={content}
                                    projectId={id}
                                    stageId={`${id}-review`}
                                    onSave={(yaml) => saveStage(yaml)}
                                    onComplete={completeStageAndAdvance}
                                    saving={saving}
                                />
                            )}
                            {currentStage === "publish" && (
                                <PublishingForm
                                    initialYaml={content}
                                    projectId={id}
                                    onSave={(yaml) => saveStage(yaml)}
                                    onComplete={completeStageAndAdvance}
                                    saving={saving}
                                />
                            )}
                        </>
                    ) : (
                        <div className="space-y-4">
                            <textarea
                                className="w-full min-h-[400px] rounded-md border p-3 font-mono text-sm"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder={`# ${currentStage} stage YAML\n# Edit content here...`}
                            />
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => saveStage(content)}
                                    disabled={saving}
                                >
                                    {saving ? "Saving..." : "Save Draft"}
                                </Button>
                                <Button
                                    onClick={() => completeStageAndAdvance(content)}
                                    disabled={saving}
                                >
                                    Complete & Continue →
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t bg-muted">
                    <div className="text-sm text-muted-foreground">
                        {saving
                            ? "Saving..."
                            : lastSaved
                                ? `Last saved: ${new Date(lastSaved).toLocaleTimeString()}`
                                : "Not saved yet"}
                    </div>
                    {!project.auto_advance && !isLastStage && (
                        <Button variant="outline" onClick={advanceToNextStage}>
                            Next Stage →
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================
// Stage Form Components (Publish only - others imported)
// ============================================

interface StageFormProps {
    initialYaml?: string;
    onSave: (yamlContent: string) => void;
    onComplete: (yamlContent: string) => void;
    saving?: boolean;
}

function PublishForm({ initialYaml, onSave, onComplete, saving, projectId }: StageFormProps & { projectId: string }) {
    const [platformTab, setPlatformTab] = useState<"wordpress" | "youtube" | "podcast">("wordpress");
    const [blogContent, setBlogContent] = useState<any>(null);

    useEffect(() => {
        // Fetch production stage to get blog content
        const fetchProductionContent = async () => {
            try {
                const res = await fetch(`/api/stages/${projectId}/production`);
                if (res.ok) {
                    const json = await res.json();
                    const yamlContent = json.data?.stage?.yaml_artifact;
                    if (yamlContent) {
                        const parsed = yaml.load(yamlContent) as any;
                        if (parsed?.production_output?.blog || parsed?.blog) {
                            setBlogContent(parsed.production_output?.blog || parsed.blog);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch production content:", err);
            }
        };

        fetchProductionContent();
    }, [projectId]);

    return (
        <div className="space-y-6">
            <Tabs value={platformTab} onValueChange={(v: any) => setPlatformTab(v)}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="wordpress">
                        WordPress
                    </TabsTrigger>
                    <TabsTrigger value="youtube" disabled>
                        YouTube (Coming Soon)
                    </TabsTrigger>
                    <TabsTrigger value="podcast" disabled>
                        Podcast (Coming Soon)
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="wordpress" className="mt-6">
                    <PublishingForm projectId={projectId} blogContent={blogContent} />
                </TabsContent>

                <TabsContent value="youtube" className="mt-6">
                    <div className="text-center py-12 text-muted-foreground">
                        <p>YouTube publishing integration coming soon</p>
                    </div>
                </TabsContent>

                <TabsContent value="podcast" className="mt-6">
                    <div className="text-center py-12 text-muted-foreground">
                        <p>Podcast platform publishing coming soon</p>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
