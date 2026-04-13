"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import UserMenu from "@/components/layout/UserMenu";
import { Search, Moon, Sun } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
    "/": "Dashboard",
    "/projects": "Projects",
    "/ideas": "Ideas",
    "/research": "Research",
    "/blogs": "Blogs",
    "/videos": "Videos",
    "/shorts": "Shorts",
    "/podcasts": "Podcasts",
    "/templates": "Templates",
    "/images": "Image Bank",
    "/assets": "Assets",
    "/settings": "Settings",
    "/settings/image-generation": "Image Generation",
    "/settings/ai": "AI Settings",
    "/settings/agents": "Agents",
    "/settings/wordpress": "WordPress",
};

function getPageTitle(pathname: string): string {
    if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
    const segments = pathname.split("/").filter(Boolean);
    while (segments.length > 0) {
        const path = "/" + segments.join("/");
        if (PAGE_TITLES[path]) return PAGE_TITLES[path];
        segments.pop();
    }
    return "Dashboard";
}

export default function Topbar() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const title = getPageTitle(pathname);

    return (
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border px-7 py-3.5 bg-[rgba(10,16,23,0.85)] backdrop-blur-[16px]">
            <h1 className="font-display text-[17px] font-bold tracking-tight">{title}</h1>

            <div className="flex items-center gap-2.5">
                <div className="hidden sm:flex items-center gap-2 rounded-[9px] border border-border bg-secondary/60 px-3.5 py-[7px] w-[200px] hover:border-[#2D3F55] transition-colors">
                    <Search className="h-3.5 w-3.5 text-[#475569] shrink-0" />
                    <input
                        placeholder="Search..."
                        className="border-0 bg-transparent outline-none text-xs text-foreground placeholder:text-[#475569] w-full"
                    />
                </div>

                <StartWorkflowButton className="bg-gradient-to-br from-[#FF6B35] to-[#E85D2C] text-white shadow-[0_2px_12px_rgba(255,107,53,0.25)] hover:shadow-[0_4px_20px_rgba(255,107,53,0.4)] hover:-translate-y-px" />

                <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="w-[34px] h-[34px] rounded-[9px] border border-border flex items-center justify-center text-muted-foreground hover:border-[#2D3F55] hover:text-[#94A3B8] transition-all"
                    title="Toggle theme"
                >
                    <Sun className="h-[15px] w-[15px] hidden dark:block" />
                    <Moon className="h-[15px] w-[15px] block dark:hidden" />
                </button>

                <UserMenu />
            </div>
        </header>
    );
}
