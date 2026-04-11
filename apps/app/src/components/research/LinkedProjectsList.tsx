"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, CheckCircle2, Archive, Clock } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { type Project } from "@/lib/api/research";

interface LinkedProjectsListProps {
    projects: Project[];
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle2 }> = {
    active: { label: "Active", variant: "default", icon: CheckCircle2 },
    completed: { label: "Completed", variant: "secondary", icon: CheckCircle2 },
    archived: { label: "Archived", variant: "outline", icon: Archive },
};

const stageColors: Record<string, string> = {
    discovery: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    research: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    production: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    assets: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    published: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
};

export function LinkedProjectsList({ projects }: LinkedProjectsListProps) {
    if (!projects || projects.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No projects yet</p>
                <p className="text-sm mt-1">
                    Create a project from this research to get started.
                </p>
            </div>
        );
    }

    // Sort by creation date (newest first)
    const sortedProjects = [...projects].sort((a, b) => {
        const dateA = typeof a.created_at === "string" ? new Date(a.created_at) : a.created_at;
        const dateB = typeof b.created_at === "string" ? new Date(b.created_at) : b.created_at;
        return dateB.getTime() - dateA.getTime();
    });

    return (
        <div className="grid gap-3">
            {sortedProjects.map((project) => {
                const createdDate = typeof project.created_at === "string" ? new Date(project.created_at) : project.created_at;
                const statusInfo = statusConfig[project.status] || statusConfig.active;
                const StatusIcon = statusInfo.icon;

                return (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                        <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h4 className="font-semibold truncate">
                                                {project.title}
                                            </h4>
                                            {project.is_winner && (
                                                <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 shrink-0">
                                                    <Trophy className="h-3 w-3 mr-1" />
                                                    Winner
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge
                                                variant={statusInfo.variant}
                                                className="text-xs"
                                            >
                                                <StatusIcon className="h-3 w-3 mr-1" />
                                                {statusInfo.label}
                                            </Badge>

                                            <Badge
                                                variant="outline"
                                                className={`text-xs ${stageColors[project.current_stage] || ""}`}
                                            >
                                                {project.current_stage
                                                    ? project.current_stage.charAt(0).toUpperCase() + project.current_stage.slice(1)
                                                    : "—"}
                                            </Badge>

                                            <span className="text-xs text-muted-foreground">
                                                Created {format(createdDate, "MMM d, yyyy")}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                );
            })}
        </div>
    );
}
