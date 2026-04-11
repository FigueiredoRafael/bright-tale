"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home, Layers, FileText, Database, Settings, Archive,
    Lightbulb, PenLine, Video, Zap, Mic, Images, Wand2, Users,
} from "lucide-react";

const navItems = [
    { href: "/", label: "Dashboard", icon: Home, exact: true },
    { href: "/projects", label: "Projects", icon: Layers },
    { href: "/ideas", label: "Ideas", icon: Lightbulb },
    { href: "/research", label: "Research", icon: FileText },
    { href: "/blogs", label: "Blogs", icon: PenLine },
    { href: "/videos", label: "Videos", icon: Video },
    { href: "/shorts", label: "Shorts", icon: Zap },
    { href: "/podcasts", label: "Podcasts", icon: Mic },
    { href: "/templates", label: "Templates", icon: Database },
    { href: "/images", label: "Image Bank", icon: Images },
    { href: "/assets", label: "Assets", icon: Archive },
    { href: "/users", label: "Users", icon: Users },
];

const settingsItems = [
    { href: "/settings", label: "All Settings", icon: Settings, exact: true },
    { href: "/settings/image-generation", label: "Image Generation", icon: Wand2 },
];

export default function Sidebar() {
    const pathname = usePathname();

    function isActive(href: string, exact = false) {
        return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    }

    function navClass(href: string, exact = false) {
        const active = isActive(href, exact);
        return `relative flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] transition-all ${
            active
                ? "bg-primary/[0.08] text-primary font-medium"
                : "text-muted-foreground hover:text-[#94A3B8] hover:bg-white/[0.03]"
        }`;
    }

    return (
        <aside className="hidden md:flex md:flex-col w-[248px] bg-sidebar border-r border-sidebar-border sticky top-0 h-screen">
            {/* Brand gradient strip */}
            <div className="h-[3px] bg-gradient-to-r from-[#2DD4A8] via-[#14967A] to-[#0D7A65] shrink-0" />

            {/* Logo */}
            <div className="flex items-center gap-2.5 px-6 pt-5 pb-7">
                <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[#2DD4A8] to-[#0D7A65] flex items-center justify-center shadow-[0_0_20px_rgba(45,212,168,0.25)] shrink-0">
                    <span className="text-white text-xs font-extrabold font-display">BC</span>
                </div>
                <span className="font-display text-[17px] font-bold tracking-tight">
                    <span className="text-primary">Bright</span> Curios
                </span>
            </div>

            {/* Scrollable nav with bottom fade */}
            <nav className="flex-1 overflow-y-auto px-3 pb-2 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)] [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="flex flex-col gap-0.5">
                    {navItems.map((item) => (
                        <Link key={item.href} href={item.href} className={navClass(item.href, item.exact)}>
                            {isActive(item.href, item.exact) && (
                                <div className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-r bg-primary shadow-[0_0_8px_rgba(45,212,168,0.5)]" />
                            )}
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                        </Link>
                    ))}

                    <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="px-3 mb-1.5 text-[10px] font-semibold text-[#475569] uppercase tracking-wider">Settings</p>
                        {settingsItems.map((item) => (
                            <Link key={item.href} href={item.href} className={navClass(item.href, item.exact)}>
                                {isActive(item.href, item.exact) && (
                                    <div className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-r bg-primary shadow-[0_0_8px_rgba(45,212,168,0.5)]" />
                                )}
                                <item.icon className="h-4 w-4 shrink-0" />
                                <span>{item.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </nav>

            <div className="px-5 py-3 border-t border-border/50 shrink-0">
                <span className="text-[11px] text-[#475569] font-mono">v0.1</span>
            </div>
        </aside>
    );
}
