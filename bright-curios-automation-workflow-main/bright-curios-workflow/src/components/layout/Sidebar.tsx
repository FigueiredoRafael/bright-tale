"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home,
    Layers,
    FileText,
    Database,
    Settings,
    Archive,
    Lightbulb,
    PenLine,
    Video,
    Zap,
    Mic,
    Images,
    Wand2,
} from "lucide-react";

export default function Sidebar() {
    const pathname = usePathname();

    function navClass(href: string, exact = false) {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
        return `flex items-center gap-3 p-2 rounded-md transition-colors text-sm ${
            active ? "bg-accent font-medium text-foreground" : "hover:bg-accent text-muted-foreground hover:text-foreground"
        }`;
    }

    return (
        <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:px-4 md:py-6 bg-white">
            <div className="mb-6 px-2">
                <div className="text-xl font-semibold">Bright Curios</div>
            </div>

            <nav className="flex flex-col gap-1 px-2 flex-1">
                <Link className={navClass("/", true)} href="/">
                    <Home className="h-4 w-4 shrink-0" />
                    <span>Dashboard</span>
                </Link>

                <Link className={navClass("/projects")} href="/projects">
                    <Layers className="h-4 w-4 shrink-0" />
                    <span>Projects</span>
                </Link>

                <Link className={navClass("/ideas")} href="/ideas">
                    <Lightbulb className="h-4 w-4 shrink-0" />
                    <span>Ideas</span>
                </Link>

                <Link className={navClass("/research")} href="/research">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span>Research</span>
                </Link>

                <Link className={navClass("/blogs")} href="/blogs">
                    <PenLine className="h-4 w-4 shrink-0" />
                    <span>Blogs</span>
                </Link>

                <Link className={navClass("/videos")} href="/videos">
                    <Video className="h-4 w-4 shrink-0" />
                    <span>Videos</span>
                </Link>

                <Link className={navClass("/shorts")} href="/shorts">
                    <Zap className="h-4 w-4 shrink-0" />
                    <span>Shorts</span>
                </Link>

                <Link className={navClass("/podcasts")} href="/podcasts">
                    <Mic className="h-4 w-4 shrink-0" />
                    <span>Podcasts</span>
                </Link>

                <Link className={navClass("/templates")} href="/templates">
                    <Database className="h-4 w-4 shrink-0" />
                    <span>Templates</span>
                </Link>

                <Link className={navClass("/images")} href="/images">
                    <Images className="h-4 w-4 shrink-0" />
                    <span>Image Bank</span>
                </Link>

                <Link className={navClass("/assets")} href="/assets">
                    <Archive className="h-4 w-4 shrink-0" />
                    <span>Assets</span>
                </Link>

                {/* Settings section — visually separated */}
                <div className="mt-4 pt-4 border-t border-border flex flex-col gap-1">
                    <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Settings
                    </p>

                    <Link className={navClass("/settings", true)} href="/settings">
                        <Settings className="h-4 w-4 shrink-0" />
                        <span>All Settings</span>
                    </Link>

                    <Link className={navClass("/settings/image-generation")} href="/settings/image-generation">
                        <Wand2 className="h-4 w-4 shrink-0" />
                        <span>Image Generation</span>
                    </Link>
                </div>
            </nav>

            <div className="mt-4 px-2 text-xs text-muted-foreground">v0.1</div>
        </aside>
    );
}
