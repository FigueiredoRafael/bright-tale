"use client";

import Link from "next/link";

export default function ProjectListItem({ project, checked, onCheck }: any) {
    return (
        <div className="flex items-start gap-4 p-3 border rounded-md">
            <input aria-label={`select-${project.id}`} type="checkbox" checked={checked} onChange={(e) => onCheck?.(project.id, e.target.checked)} />
            <div className="flex-1">
                <div className="flex items-center justify-between">
                    <Link href={`/projects/${project.id}`} className="font-medium">{project.title}</Link>
                    <div className="text-xs text-muted-foreground">{project.created_at?.slice(0, 10) ?? ""}</div>
                </div>
                <div className="text-sm text-muted-foreground">{project.current_stage} • {project.status}</div>
            </div>
        </div>
    );
}
