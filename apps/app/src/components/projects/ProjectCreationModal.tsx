"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import type { DiscoveryOutput } from "@brighttale/shared/schemas/discovery";

interface ProjectCreationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedIdeas: DiscoveryOutput["ideas"];
}

export default function ProjectCreationModal({ open, onOpenChange, selectedIdeas }: ProjectCreationModalProps) {
    const { toast } = useToast();
    const [tab, setTab] = useState("start");
    const [loading, setLoading] = useState(false);
    const [defaults, setDefaults] = useState({ goal: "growth", tone: "", blog_words: 800, video_minutes: 5, affiliate_policy: "" });
    const [perItem, setPerItem] = useState<Record<string, any>>({});
    const [applyAllMode, setApplyAllMode] = useState(false);

    const handleApplyToAll = () => {
        const map: Record<string, any> = {};
        selectedIdeas.forEach((idea) => {
            map[idea.idea_id] = { ...defaults, title: idea.title };
        });
        setPerItem(map);
        toast({ title: "Applied", description: "Defaults applied to all selected items" });
    };

    const router = useRouter();

    function validateDefaults() {
        const validGoals = ["growth", "engagement", "authority", "monetization"];
        if (defaults.goal && !validGoals.includes(defaults.goal)) {
            return "Invalid goal selected";
        }
        if (defaults.blog_words && Number(defaults.blog_words) <= 0) {
            return "Blog words must be a positive number";
        }
        if (defaults.video_minutes && Number(defaults.video_minutes) <= 0) {
            return "Video minutes must be a positive number";
        }
        return null;
    }

    const handleSubmit = async () => {
        setLoading(true);
        try {
            // Client-side validation for defaults
            const vErr = validateDefaults();
            if (vErr) {
                toast({ title: "Validation error", description: vErr, variant: "destructive" });
                setLoading(false);
                return;
            }

            const idempotency_token = (typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `token-${Date.now()}`);

            const payload = {
                research: { ideas: selectedIdeas, pick_recommendation: { best_choice: selectedIdeas[0]?.idea_id ?? "", why: "bulk create" } },
                selected_ideas: selectedIdeas.map((i) => i.idea_id),
                defaults,
                overrides: perItem,
                idempotency_token,
            };

            // Show an indeterminate progress indicator via loading state
            const res = await fetch("/api/projects/bulk-create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.status === 501) {
                const json = await res.json().catch(() => ({}));
                toast({ title: "Not implemented", description: json?.message || "Bulk create not implemented yet", variant: "destructive" });
                return;
            }

            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
                // Handle partial results if present
                if (json.project_ids && json.project_ids.length > 0) {
                    toast({ title: "Partial success", description: `Created ${json.project_ids.length} projects, but some failed`, variant: "destructive" });
                    // Optionally navigate to first created
                    onOpenChange(false);
                    router.push(`/projects/${json.project_ids[0]}`);
                    return;
                }

                toast({ title: "Error", description: json?.error?.message || "Bulk create failed", variant: "destructive" });
                return;
            }

            // Success
            toast({ title: "Success", description: `Created ${json.project_ids?.length ?? "?"} projects` });
            onOpenChange(false);
            if (json.project_ids && json.project_ids.length > 0) {
                // Open first project
                router.push(`/projects/${json.project_ids[0]}`);
            }
        } catch (err: any) {
            toast({ title: "Error", description: err.message || "Failed to create projects", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Bulk Create Projects</DialogTitle>
                    <DialogDescription>Create multiple projects from selected ideas</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <Tabs value={tab} onValueChange={(v) => setTab(v)}>
                        <TabsList>
                            <TabsTrigger value="start">Start Discovery</TabsTrigger>
                            <TabsTrigger value="use">Use Research</TabsTrigger>
                            <TabsTrigger value="quick">Quick Entry</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-3">
                            <div className="p-3 border rounded-md">
                                <h4 className="font-medium">Selected Ideas ({selectedIdeas.length})</h4>
                                <div className="mt-2 space-y-2 max-h-56 overflow-auto">
                                    {selectedIdeas.map((idea) => (
                                        <div key={idea.idea_id} className="p-2 border rounded flex items-start gap-3">
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <strong>{perItem[idea.idea_id]?.title ?? idea.title}</strong>
                                                    <span className="text-sm text-muted-foreground">{idea.verdict}</span>
                                                </div>
                                                {applyAllMode && (
                                                    <div className="mt-2 grid gap-2">
                                                        <Input value={perItem[idea.idea_id]?.title ?? idea.title} onChange={(e) => setPerItem((p) => ({ ...p, [idea.idea_id]: { ...(p[idea.idea_id] || {}), title: e.target.value } }))} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => { setApplyAllMode((s) => !s); }}>{applyAllMode ? "Done editing" : "Edit individually"}</Button>
                                <Button onClick={handleApplyToAll}>Apply to all</Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="p-3 border rounded-md">
                                <h4 className="font-medium">Global Defaults</h4>
                                <div className="grid gap-2 mt-3">
                                    <Label>Goal</Label>
                                    <Input value={defaults.goal} onChange={(e) => setDefaults((d) => ({ ...d, goal: e.target.value }))} />

                                    <Label>Tone</Label>
                                    <Input value={defaults.tone} onChange={(e) => setDefaults((d) => ({ ...d, tone: e.target.value }))} />

                                    <Label>Blog words</Label>
                                    <Input type="number" value={defaults.blog_words} onChange={(e) => setDefaults((d) => ({ ...d, blog_words: Number(e.target.value) }))} />

                                    <Label>Video minutes</Label>
                                    <Input type="number" value={defaults.video_minutes} onChange={(e) => setDefaults((d) => ({ ...d, video_minutes: Number(e.target.value) }))} />

                                    <Label>Affiliate policy</Label>
                                    <Textarea value={defaults.affiliate_policy} onChange={(e) => setDefaults((d) => ({ ...d, affiliate_policy: e.target.value }))} />
                                </div>
                            </div>

                            <div className="p-3 border rounded-md">
                                <h4 className="font-medium">Actions</h4>
                                <div className="flex gap-2 mt-3">
                                    <Button onClick={handleApplyToAll}>Apply to all</Button>
                                    <Button variant="secondary" onClick={() => setPerItem({})}>Reset overrides</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={loading}>{loading ? "Working..." : "Create Projects"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
