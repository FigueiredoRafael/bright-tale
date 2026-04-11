"use client";

import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import { Search } from "lucide-react";

export default function Topbar() {
    return (
        <header className="flex items-center justify-between border-b bg-white px-4 py-3">
            <div className="flex items-center gap-4">
                <h1 className="text-lg font-semibold">Dashboard</h1>
                <div className="hidden sm:flex items-center gap-2 rounded-md border px-2 py-1">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input placeholder="Search..." className="border-0 bg-transparent outline-none text-sm" />
                </div>
            </div>

            <div className="flex items-center gap-3">
                <StartWorkflowButton />
                <div className="w-8 h-8 rounded-full bg-muted-foreground/10 flex items-center justify-center text-sm">U</div>
            </div>
        </header>
    );
}
