"use client";

import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

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
}

export default function ProjectCard({ project, checked = false, onCheck }: ProjectCardProps) {
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
                <div className="text-xs text-muted-foreground">{project.created_at?.slice(0, 10) ?? ""}</div>
            </CardHeader>
            <CardContent>
                {/* placeholder for summary or quick actions */}
            </CardContent>
        </Card>
    );
}
