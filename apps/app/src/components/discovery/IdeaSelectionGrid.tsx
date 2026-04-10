"use client";

import React, { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProjectCreationModal from "@/components/projects/ProjectCreationModal";
import type { DiscoveryOutput } from "@/lib/schemas/discovery";

interface IdeaSelectionGridProps {
    ideas?: DiscoveryOutput["ideas"];
}

export default function IdeaSelectionGrid({ ideas = [] }: IdeaSelectionGridProps) {
    const [filter, setFilter] = useState<string | "all">("all");
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [selectAll, setSelectAll] = useState(false);
    const [openModal, setOpenModal] = useState(false);

    const filtered = useMemo(() => {
        return filter === "all" ? ideas : ideas.filter((i) => i.verdict === filter);
    }, [ideas, filter]);

    const toggleOne = (id: string) => {
        setSelected((s) => ({ ...s, [id]: !s[id] }));
    };

    const toggleAll = () => {
        if (!selectAll) {
            const map: Record<string, boolean> = {};
            filtered.forEach((i) => (map[i.idea_id] = true));
            setSelected((s) => ({ ...s, ...map }));
            setSelectAll(true);
        } else {
            // Deselect filtered
            const map = { ...selected };
            filtered.forEach((i) => delete map[i.idea_id]);
            setSelected(map);
            setSelectAll(false);
        }
    };

    const selectedIdeas = ideas.filter((i) => selected[i.idea_id]);

    return (
        <div className="p-4 border rounded-md space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Idea Selection</h3>
                <div className="flex items-center gap-2">
                    <Select onValueChange={(v) => setFilter(v as any)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by verdict" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="viable">Viable</SelectItem>
                            <SelectItem value="weak">Weak</SelectItem>
                            <SelectItem value="experimental">Experimental</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                        <Checkbox checked={selectAll} onCheckedChange={toggleAll} />
                        <span className="text-sm text-muted-foreground">Select all</span>
                    </div>
                    <Button onClick={() => setOpenModal(true)} disabled={selectedIdeas.length === 0}>Open Bulk Create ({selectedIdeas.length})</Button>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
                {filtered.map((idea) => (
                    <div key={idea.idea_id} className="p-3 border rounded-lg flex gap-3 items-start">
                        <Checkbox checked={!!selected[idea.idea_id]} onCheckedChange={() => toggleOne(idea.idea_id)} />
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="font-medium">{idea.title}</h4>
                                <span className="text-sm text-muted-foreground">{idea.verdict}</span>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-3">{idea.core_tension}</p>
                        </div>
                    </div>
                ))}
            </div>

            <ProjectCreationModal open={openModal} onOpenChange={setOpenModal} selectedIdeas={selectedIdeas} />
        </div>
    );
}
