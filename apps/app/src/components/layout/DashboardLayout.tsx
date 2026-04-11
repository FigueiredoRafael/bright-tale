"use client";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background relative">
            {/* Ambient brand orb — subtle teal glow top-right */}
            <div className="fixed top-[-200px] right-[-120px] w-[550px] h-[550px] rounded-full bg-[radial-gradient(circle,rgba(45,212,168,0.035)_0%,transparent_65%)] pointer-events-none z-0" />

            <div className="flex relative z-[1]">
                <Sidebar />
                <div className="flex-1 flex flex-col min-w-0">
                    <Topbar />
                    <main className="flex-1 p-7 max-w-[1140px]">{children}</main>
                </div>
            </div>
        </div>
    );
}
