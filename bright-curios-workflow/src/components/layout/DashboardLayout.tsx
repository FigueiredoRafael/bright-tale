"use client";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black">
            <div className="flex">
                <Sidebar />
                <div className="flex-1 flex flex-col">
                    <Topbar />
                    <main className="flex-1 p-6">{children}</main>
                </div>
            </div>
        </div>
    );
}
