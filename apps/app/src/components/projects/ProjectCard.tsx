"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProjectCardProps {
    project: {
        id: string;
        title: string;
        current_stage: string;
        status: string;
        winner?: boolean;
        created_at?: string;
        research?: { title?: string } | null;
    };
    checked?: boolean;
    onCheck?: (id: string, checked: boolean) => void;
    onDeleted?: () => void;
}

export default function ProjectCard({ project, checked = false, onCheck, onDeleted }: ProjectCardProps) {
    const [deleting, setDeleting] = useState(false);
    const { toast } = useToast();

    async function handleDelete() {
        if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed");
            toast({ title: "Project deleted" });
            onDeleted?.();
        } catch {
            toast({ title: "Failed to delete project", variant: "destructive" });
        } finally {
            setDeleting(false);
        }
    }

    return (
        <Card className="w-full">
            <CardHeader className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Checkbox checked={checked} onCheckedChange={(v) => onCheck?.(project.id, Boolean(v))} />
                    <div>
                        <CardTitle className="text-sm">
                            <Link href={`/projects/${project.id}`}>{project.title}</Link>
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                            {project.current_stage} • {project.status}
                            {project.research?.title ? ` • Research: ${project.research.title}` : ""}
                        </CardDescription>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{project.created_at?.slice(0, 10) ?? ""}</span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleDelete} disabled={deleting} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
        </Card>
    );
}
