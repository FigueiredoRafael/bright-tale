"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface BulkActionToolbarProps {
    selectedIds: string[];
    onDone?: () => void;
}

export default function BulkActionToolbar({ selectedIds, onDone }: BulkActionToolbarProps) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const runAction = async (operation: string, extra?: Record<string, any>) => {
        if (selectedIds.length === 0) return;

        if (operation === "delete" && !confirm(`Delete ${selectedIds.length} projects? This cannot be undone.`)) {
            return;
        }

        if (operation === "change_status" && !extra?.new_status) {
            toast({ title: `Please select a status`, variant: "destructive" });
            return;
        }

        setLoading(true);

        try {
            const res = await fetch("/api/projects/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ operation, project_ids: selectedIds, ...extra }),
            });

            if (!res.ok) throw new Error("Failed");

            // For export, expect a blob
            if (operation === "export") {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `projects-export.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                toast({ title: `Bulk ${operation} succeeded` });
            }

            onDone?.();
        } catch (err) {
            toast({ title: `Bulk ${operation} failed`, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-3">
            <div className="text-sm">Selected: {selectedIds.length}</div>
            <select aria-label="change-status" className="rounded-md border px-2 py-1" onChange={(e) => runAction("change_status", { new_status: e.target.value })} defaultValue="">
                <option value="">Change status...</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => runAction("archive") as any} disabled={loading || selectedIds.length === 0}>
                Archive
            </Button>
            <Button variant="outline" size="sm" onClick={() => runAction("export") as any} disabled={loading || selectedIds.length === 0}>
                Export
            </Button>
            <Button variant="destructive" size="sm" onClick={() => runAction("delete") as any} disabled={loading || selectedIds.length === 0}>
                Delete
            </Button>
        </div>
    );
}
