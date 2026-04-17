"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/projects/ProjectCard";
import BulkActionToolbar from "@/components/projects/BulkActionToolbar";
import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import SearchBar from "@/components/projects/SearchBar";
import Filters from "@/components/projects/Filters";
import { useToast } from "@/hooks/use-toast";

export default function ProjectsDashboard() {
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [search, setSearch] = useState<string>("");
    const [filters, setFilters] = useState<{ stage?: string | null; status?: string | null; sort?: string }>({ sort: "created_at" });
    const [viewMode, setViewMode] = useState<"card" | "list">(() => (typeof window !== "undefined" ? (localStorage.getItem("projects:view") as "card" | "list" | null) ?? "card" : "card"));
    const { toast } = useToast();

    const fetchProjects = useCallback(async (opts?: { search?: string; stage?: string | null; status?: string | null; sort?: string }) => {
        try {
            const params = new URLSearchParams();
            if (opts?.search) params.set("search", opts.search);
            if (opts?.stage) params.set("stage", opts.stage);
            if (opts?.status) params.set("status", opts.status);
            if (opts?.sort) params.set("sort", opts.sort);

            const url = `/api/projects${params.toString() ? `?${params.toString()}` : ""}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch projects");
            const json = await res.json();
            setProjects(json.data?.projects || []);

            // Update URL query params for shareability
            if (typeof window !== "undefined") {
                const uq = new URL(window.location.href);
                if (opts?.search) uq.searchParams.set("search", opts.search);
                else uq.searchParams.delete("search");
                if (opts?.stage) uq.searchParams.set("stage", opts.stage);
                else uq.searchParams.delete("stage");
                if (opts?.status) uq.searchParams.set("status", opts.status);
                else uq.searchParams.delete("status");
                if (opts?.sort) uq.searchParams.set("sort", opts.sort);
                else uq.searchParams.delete("sort");
                window.history.replaceState({}, "", uq.toString());
            }
        } catch (err) {
            toast({ title: "Failed to load projects", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchProjects({ ...filters, search });
    }, [fetchProjects, filters, search]);

    // Stable handlers to avoid re-creating functions each render (prevents SearchBar effect loop)
    const handleSearch = useCallback((v: string) => {
        setSearch(v);
        fetchProjects({ search: v, stage: filters.stage, status: filters.status, sort: filters.sort });
    }, [fetchProjects, filters]);

    const handleFiltersChange = useCallback((f: { stage?: string | null; status?: string | null; sort?: string }) => {
        setFilters(f);
        fetchProjects({ search, stage: f.stage, status: f.status, sort: f.sort });
    }, [fetchProjects, search]);

    const onCheck = useCallback((id: string, checked: boolean) => {
        setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((i) => i !== id)));
    }, []);

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-heading-md">Projects</h1>
                <div className="flex items-center gap-3">
                    <StartWorkflowButton />
                    <Button variant="ghost" onClick={() => fetchProjects()}>
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <SearchBar defaultValue={search} onSearch={handleSearch} />
                    <Filters stage={filters.stage} status={filters.status} sort={filters.sort} onChange={handleFiltersChange} />
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => {
                        const nv = viewMode === "card" ? "list" : "card";
                        setViewMode(nv);
                        try { localStorage.setItem("projects:view", nv); } catch (e) { }
                    }}>{viewMode === "card" ? "List view" : "Card view"}</Button>
                    {selectedIds.length > 0 && (
                        <BulkActionToolbar selectedIds={selectedIds} onDone={() => { setSelectedIds([]); fetchProjects({ search, stage: filters.stage, status: filters.status, sort: filters.sort }); }} />
                    )}
                </div>
            </div>

            <div className="grid gap-4">
                {loading ? (
                    <div>Loading...</div>
                ) : projects.length === 0 ? (
                    <div>No projects yet</div>
                ) : (
                    projects.map((p) => (
                        <ProjectCard key={p.id} project={p} checked={selectedIds.includes(p.id)} onCheck={onCheck} onDeleted={() => fetchProjects({ search, stage: filters.stage, status: filters.status, sort: filters.sort })} />
                    ))
                )}
            </div>
        </div>
    );
}
