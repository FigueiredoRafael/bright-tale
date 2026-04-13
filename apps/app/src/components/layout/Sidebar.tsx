"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home, Radio, Lightbulb, FileText, PenLine, Video, Zap, Mic,
    Images, Archive, Database, Settings, Users, Wand2, Sparkles,
    type LucideIcon,
} from "lucide-react";
import { ChannelSwitcher } from "./ChannelSwitcher";
import { useActiveChannel } from "@/hooks/use-active-channel";

interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    exact?: boolean;
}

interface NavSection {
    label: string;
    items: NavItem[];
}

export default function Sidebar() {
    const pathname = usePathname();
    const { activeChannelId, activeChannel } = useActiveChannel();

    // Dynamic library: only show media types the active channel actually produces.
    // If no active channel, show all (user-friendly default).
    const channelMedia = activeChannel?.media_types ?? ['blog', 'video', 'shorts', 'podcast'];
    const libraryItems: NavItem[] = [];
    if (channelMedia.includes('blog')) libraryItems.push({ href: "/blogs", label: "Blogs", icon: PenLine });
    if (channelMedia.includes('video')) libraryItems.push({ href: "/videos", label: "Videos", icon: Video });
    if (channelMedia.includes('shorts')) libraryItems.push({ href: "/shorts", label: "Shorts", icon: Zap });
    if (channelMedia.includes('podcast')) libraryItems.push({ href: "/podcasts", label: "Podcasts", icon: Mic });

    const sections: NavSection[] = [
        {
            label: "Principal",
            items: [
                { href: "/", label: "Dashboard", icon: Home, exact: true },
                { href: "/channels", label: "Content Channels", icon: Radio },
            ],
        },
        {
            label: "Criar conteúdo",
            items: activeChannelId
                ? [
                    { href: `/channels/${activeChannelId}/create`, label: "Create Content", icon: Sparkles },
                    { href: "/ideas", label: "Ideas", icon: Lightbulb },
                    { href: "/research", label: "Research", icon: FileText },
                ]
                : [
                    { href: "/onboarding", label: "Create Content Channel", icon: Sparkles },
                ],
        },
        {
            label: "Biblioteca",
            items: libraryItems,
        },
        {
            label: "Recursos",
            items: [
                { href: "/images", label: "Image Bank", icon: Images },
                { href: "/assets", label: "Assets", icon: Archive },
                { href: "/templates", label: "Templates", icon: Database },
            ],
        },
        {
            label: "Configurações",
            items: [
                { href: "/settings", label: "All Settings", icon: Settings, exact: true },
                { href: "/settings/team", label: "Team", icon: Users },
                { href: "/settings/image-generation", label: "Image Generation", icon: Wand2 },
            ],
        },
    ];

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
            <div className="flex items-center gap-2.5 px-6 pt-5 pb-4">
                <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[#2DD4A8] to-[#0D7A65] flex items-center justify-center shadow-[0_0_20px_rgba(45,212,168,0.25)] shrink-0">
                    <span className="text-white text-xs font-extrabold font-display">BT</span>
                </div>
                <span className="font-display text-[17px] font-bold tracking-tight">
                    <span className="text-primary">Bright</span> Tale
                </span>
            </div>

            {/* Channel switcher */}
            <ChannelSwitcher />

            {/* Scrollable nav */}
            <nav className="flex-1 overflow-y-auto px-3 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)] [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="flex flex-col gap-3">
                    {sections.filter((s) => s.items.length > 0).map((section, i) => (
                        <div key={section.label} className={i > 0 ? "pt-2 border-t border-border/30" : ""}>
                            <p className="px-3 mb-1.5 text-[10px] font-semibold text-[#475569] uppercase tracking-wider">
                                {section.label}
                            </p>
                            <div className="flex flex-col gap-0.5">
                                {section.items.map((item) => (
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
                    ))}
                </div>
            </nav>

            <div className="px-5 py-3 border-t border-border/50 shrink-0">
                <span className="text-[11px] text-[#475569] font-mono">v0.2</span>
            </div>
        </aside>
    );
}
