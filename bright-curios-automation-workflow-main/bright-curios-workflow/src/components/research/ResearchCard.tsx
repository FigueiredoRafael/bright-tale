"use client";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, FolderKanban, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface ResearchCardProps {
    id: string;
    title: string;
    theme?: string | null;
    winners_count: number;
    projects_count: number;
    updated_at: Date | string;
    className?: string;
}

export function ResearchCard({
    id,
    title,
    theme,
    winners_count,
    projects_count,
    updated_at,
    className,
}: ResearchCardProps) {
    const updatedDate = typeof updated_at === "string" ? new Date(updated_at) : updated_at;
    const timeAgo = formatDistanceToNow(updatedDate, { addSuffix: true });

    return (
        <Card
            className={`hover:shadow-lg transition-all duration-200 hover:scale-[1.02] ${className || ""}`}
        >
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-lg line-clamp-2 flex-1">
                        {title}
                    </h3>
                    {theme && (
                        <Badge variant="secondary" className="shrink-0">
                            {theme}
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="pb-3">
                <div className="flex flex-col gap-2">
                    {/* Performance Badges */}
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-amber-600">
                            <Trophy className="h-4 w-4" />
                            <span className="font-medium">{winners_count}</span>
                            <span className="text-muted-foreground">
                                {winners_count === 1 ? "winner" : "winners"}
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-blue-600">
                            <FolderKanban className="h-4 w-4" />
                            <span className="font-medium">{projects_count}</span>
                            <span className="text-muted-foreground">
                                {projects_count === 1 ? "project" : "projects"}
                            </span>
                        </div>
                    </div>

                    {/* Last Updated */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Updated {timeAgo}</span>
                    </div>
                </div>
            </CardContent>

            <CardFooter>
                <Link href={`/research/${id}`} className="w-full">
                    <Button variant="outline" className="w-full">
                        View Details
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    );
}
