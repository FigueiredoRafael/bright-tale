"use client";

import { Trophy, FolderKanban, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";

interface ResearchStatsProps {
    winners_count: number;
    projects_count: number;
    created_at: Date | string;
    updated_at: Date | string;
    className?: string;
}

export function ResearchStats({
    winners_count,
    projects_count,
    created_at,
    updated_at,
    className,
}: ResearchStatsProps) {
    const parseDate = (value: Date | string | undefined | null): Date | null => {
        if (!value) return null;
        const date = typeof value === "string" ? new Date(value) : value;
        return isNaN(date.getTime()) ? null : date;
    };

    const createdDate = parseDate(created_at);
    const updatedDate = parseDate(updated_at);

    // Determine if this is high-performing research
    const isHighPerforming = winners_count >= 3 || (projects_count >= 10 && winners_count >= 2);

    return (
        <div className={`flex flex-wrap items-center gap-4 ${className || ""}`}>
            {/* Winners Count */}
            <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${winners_count > 0
                    ? "bg-amber-100 dark:bg-amber-900/30"
                    : "bg-muted"
                    }`}>
                    <Trophy className={`h-5 w-5 ${winners_count > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                        }`} />
                </div>
                <div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-2xl font-bold">{winners_count}</span>
                        {isHighPerforming && (
                            <span className="text-xs font-medium bg-amber-500 text-white px-2 py-0.5 rounded-full">
                                High ROI
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {winners_count === 1 ? "Winner" : "Winners"}
                    </p>
                </div>
            </div>

            {/* Projects Count */}
            <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${projects_count > 0
                    ? "bg-blue-100 dark:bg-blue-900/30"
                    : "bg-muted"
                    }`}>
                    <FolderKanban className={`h-5 w-5 ${projects_count > 0
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-muted-foreground"
                        }`} />
                </div>
                <div>
                    <span className="text-2xl font-bold">{projects_count}</span>
                    <p className="text-xs text-muted-foreground">
                        {projects_count === 1 ? "Project" : "Projects"}
                    </p>
                </div>
            </div>

            {/* Divider */}
            <div className="h-12 w-px bg-border hidden sm:block" />

            {/* Dates */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Created:</span>
                    <span className="font-medium">
                        {createdDate ? format(createdDate, "MMM d, yyyy") : "—"}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Updated:</span>
                    <span className="font-medium">
                        {updatedDate ? format(updatedDate, "MMM d, yyyy") : "—"}
                    </span>
                </div>
            </div>
        </div>
    );
}
