"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createProjectFromResearch } from "@/lib/api/research";

export default function StartWorkflowButton({ className }: { className?: string }) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleStart = async () => {
        setLoading(true);
        try {
            const project = await createProjectFromResearch({
                title: "New Project",
                current_stage: "discovery",
                status: "active",
                research_id: undefined as unknown as string, // optional
            });

            toast({ title: "Project created", description: `Created ${project.title}` });
            router.push(`/projects/${project.id}`);
        } catch (err) {
            toast({ title: "Failed to create project", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button onClick={handleStart} disabled={loading} className={className}>
            {loading ? "Starting..." : "Start Workflow"}
        </Button>
    );
}
