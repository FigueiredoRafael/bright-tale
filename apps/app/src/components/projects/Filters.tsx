"use client";

import { useState } from "react";

interface FiltersProps {
    stage?: string | null;
    status?: string | null;
    sort?: string;
    onChange: (filters: { stage?: string | null; status?: string | null; sort?: string }) => void;
}

export default function Filters({ stage = null, status = null, sort = "created_at", onChange }: FiltersProps) {
    return (
        <div className="flex items-center gap-2">
            <select
                aria-label="stage-filter"
                className="rounded-md border px-2 py-1"
                value={stage ?? ""}
                onChange={(e) => onChange({ stage: e.target.value || null, status, sort })}
            >
                <option value="">All stages</option>
                <option value="discovery">Discovery</option>
                <option value="production">Production</option>
                <option value="review">Review</option>
            </select>

            <select
                aria-label="status-filter"
                className="rounded-md border px-2 py-1"
                value={status ?? ""}
                onChange={(e) => onChange({ stage, status: e.target.value || null, sort })}
            >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
            </select>

            <select
                aria-label="sort-filter"
                className="rounded-md border px-2 py-1"
                value={sort}
                onChange={(e) => onChange({ stage, status, sort: e.target.value })}
            >
                <option value="created_at">Newest</option>
                <option value="updated_at">Recently updated</option>
                <option value="title">Title</option>
            </select>
        </div>
    );
}
