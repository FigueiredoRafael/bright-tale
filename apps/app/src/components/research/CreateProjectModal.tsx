"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Lightbulb, ArrowRight } from "lucide-react";
import { createProjectFromResearch } from "@/lib/api/research";

interface CreateProjectModalProps {
    researchId: string;
    researchTitle: string;
    researchTheme?: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateProjectModal({
    researchId,
    researchTitle,
    researchTheme,
    open,
    onOpenChange,
}: CreateProjectModalProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [projectTitle, setProjectTitle] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!projectTitle.trim()) {
            setError("Project title is required");
            return;
        }

        setLoading(true);

        try {
            const project = await createProjectFromResearch({
                title: projectTitle.trim(),
                research_id: researchId,
                current_stage: "production",
                status: "active",
            });

            toast({
                title: "Project created",
                description: `${projectTitle} has been created and linked to this research.`,
            });

            onOpenChange(false);
            setProjectTitle("");

            // Navigate to the new project
            router.push(`/projects/${project.id}`);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create project",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[525px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-500" />
                            Create Project from Research
                        </DialogTitle>
                        <DialogDescription>
                            Create a new project that will be automatically linked to this research
                            and start at the Production stage.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {/* Research Info Display */}
                        <div className="p-4 bg-muted rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Source Research:</span>
                                {researchTheme && (
                                    <Badge variant="secondary">{researchTheme}</Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {researchTitle}
                            </p>
                        </div>

                        {/* Arrow Indicator */}
                        <div className="flex justify-center">
                            <ArrowRight className="h-5 w-5 text-muted-foreground" />
                        </div>

                        {/* Project Title Input */}
                        <div className="grid gap-2">
                            <Label htmlFor="title">
                                Project Title <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="title"
                                placeholder="Enter project title"
                                value={projectTitle}
                                onChange={(e) => {
                                    setProjectTitle(e.target.value);
                                    setError("");
                                }}
                                className={error ? "border-destructive" : ""}
                                autoFocus
                            />
                            {error && (
                                <p className="text-sm text-destructive">{error}</p>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <div className="flex gap-2">
                                <div className="text-blue-600 dark:text-blue-400 mt-0.5">ℹ️</div>
                                <div className="text-sm text-blue-900 dark:text-blue-100">
                                    <p className="font-medium mb-1">Project will be:</p>
                                    <ul className="space-y-1 text-xs">
                                        <li>• Linked to this research automatically</li>
                                        <li>• Set to <strong>Production</strong> stage (skip Discovery)</li>
                                        <li>• Marked as <strong>Active</strong></li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Creating..." : "Create Project"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
