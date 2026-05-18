"use client";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default function StartWorkflowButton({ className }: { className?: string }) {
    const router = useRouter();

    return (
        <Button onClick={() => router.push("/projects/new")} className={className}>
            Start Workflow
        </Button>
    );
}
