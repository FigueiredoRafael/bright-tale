"use client";

import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import UserMenu from "@/components/layout/UserMenu";
import { Search, Moon, Sun } from "lucide-react";

const PAGE_TITLE_KEYS: Record<string, { ns: string; key: string }> = {
    "/": { ns: "nav", key: "dashboard" },
    "/projects": { ns: "pages", key: "projects" },
    "/ideas": { ns: "nav", key: "ideas" },
    "/research": { ns: "nav", key: "research" },
    "/blogs": { ns: "nav", key: "blogs" },
    "/videos": { ns: "nav", key: "videos" },
    "/shorts": { ns: "nav", key: "shorts" },
    "/podcasts": { ns: "nav", key: "podcasts" },
    "/templates": { ns: "nav", key: "templates" },
    "/images": { ns: "nav", key: "imageBank" },
    "/assets": { ns: "nav", key: "assets" },
    "/settings": { ns: "nav", key: "settings" },
    "/settings/image-generation": { ns: "nav", key: "imageGeneration" },
    "/settings/ai": { ns: "pages", key: "aiSettings" },
    "/settings/agents": { ns: "pages", key: "agents" },
    "/settings/wordpress": { ns: "pages", key: "wordpress" },
};

function getPageTitle(pathname: string, t: (ns: string, key: string) => string): string {
    const titleKey = PAGE_TITLE_KEYS[pathname];
    if (titleKey) return t(titleKey.ns, titleKey.key);

    const segments = pathname.split("/").filter(Boolean);
    while (segments.length > 0) {
        const path = "/" + segments.join("/");
        const key = PAGE_TITLE_KEYS[path];
        if (key) return t(key.ns, key.key);
        segments.pop();
    }

    return t("nav", "dashboard");
}

export default function Topbar() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const tNav = useTranslations("nav");
    const tPages = useTranslations("pages");
    const tCommon = useTranslations("common");

    const t = (ns: string, key: string) => {
        if (ns === "nav") return tNav(key);
        if (ns === "pages") return tPages(key);
        return key;
    };

    const title = getPageTitle(pathname, t);

    return (
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border px-7 py-3.5 bg-[rgba(10,16,23,0.85)] backdrop-blur-[16px]">
            <h1 className="font-display text-[17px] font-bold tracking-tight">{title}</h1>

            <div className="flex items-center gap-2.5">
                <div className="hidden sm:flex items-center gap-2 rounded-[9px] border border-border bg-secondary/60 px-3.5 py-[7px] w-[200px] hover:border-[#2D3F55] transition-colors">
                    <Search className="h-3.5 w-3.5 text-[#475569] shrink-0" />
                    <input
                        placeholder={tCommon("search")}
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
