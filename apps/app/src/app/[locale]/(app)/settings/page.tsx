"use client";

import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Bot,
    Globe,
    Image as ImageIcon,
    Key,
    Settings as SettingsIcon,
    ChevronRight,
    Sparkles,
    Link as LinkIcon,
    Users,
} from "lucide-react";

interface SettingsCard {
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
    badge?: string;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

export default function SettingsPage() {
    const settingsCards: SettingsCard[] = [
        {
            title: "Team",
            description: "Manage organization members, invite new team members, and configure roles and permissions.",
            href: "/settings/team",
            icon: <Users className="h-6 w-6" />,
            badge: "Active",
            badgeVariant: "default",
        },
        {
            title: "Agent Prompts",
            description: "Configure AI agent instructions, input/output schemas, and behavior for the 4-agent workflow system.",
            href: "/settings/agents",
            icon: <Bot className="h-6 w-6" />,
            badge: "Active",
            badgeVariant: "default",
        },
        {
            title: "WordPress Integration",
            description: "Manage WordPress site connections, credentials, and publishing settings for blog content.",
            href: "/settings/wordpress",
            icon: <Globe className="h-6 w-6" />,
            badge: "New",
            badgeVariant: "secondary",
        },
        {
            title: "AI Provider Configuration",
            description: "Configure OpenAI, Anthropic, and other AI providers with API keys and generation settings.",
            href: "/settings/ai",
            icon: <Sparkles className="h-6 w-6" />,
            badge: "Active",
            badgeVariant: "default",
        },
        {
            title: "Image Generation",
            description: "Configure Google Gemini Imagen for AI-powered blog and video image generation.",
            href: "/settings/image-generation",
            icon: <ImageIcon className="h-6 w-6" />,
            badge: "New",
            badgeVariant: "secondary",
        },
        {
            title: "API Keys & Security",
            description: "Manage encryption keys, API credentials, and security settings for the platform.",
            href: "/settings/security",
            icon: <Key className="h-6 w-6" />,
            badge: "Coming Soon",
            badgeVariant: "outline",
        },
    ];

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <SettingsIcon className="h-8 w-8 text-muted-foreground" />
                    <h1 className="text-3xl font-bold">Settings</h1>
                </div>
                <p className="text-muted-foreground">
                    Configure integrations, AI agents, and platform settings
                </p>
            </div>

            {/* Settings Cards Grid */}
            <div className="grid gap-4 md:grid-cols-2">
                {settingsCards.map((card) => {
                    const isDisabled = card.badge === "Coming Soon";

                    return isDisabled ? (
                        <Card
                            key={card.href}
                            className="relative overflow-hidden opacity-60 cursor-not-allowed"
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-muted rounded-lg">
                                            {card.icon}
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">
                                                {card.title}
                                            </CardTitle>
                                            {card.badge && (
                                                <Badge
                                                    variant={card.badgeVariant}
                                                    className="mt-1"
                                                >
                                                    {card.badge}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="text-sm">
                                    {card.description}
                                </CardDescription>
                            </CardContent>
                        </Card>
                    ) : (
                        <Link key={card.href} href={card.href}>
                            <Card className="h-full hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer group">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                                {card.icon}
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    {card.title}
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                                                </CardTitle>
                                                {card.badge && (
                                                    <Badge
                                                        variant={card.badgeVariant}
                                                        className="mt-1"
                                                    >
                                                        {card.badge}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="text-sm">
                                        {card.description}
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        </Link>
                    );
                })}
            </div>

            {/* Quick Links Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <LinkIcon className="h-5 w-5" />
                        Quick Links
                    </CardTitle>
                    <CardDescription>
                        Helpful resources and documentation
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-2 text-sm">
                        <a
                            href="/docs/API.md"
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                        >
                            <span>API Documentation</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </a>
                        <a
                            href="/docs/DATABASE.md"
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                        >
                            <span>Database Schema</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </a>
                        <a
                            href="/docs/ENVIRONMENT.md"
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                        >
                            <span>Environment Configuration</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </a>
                    </div>
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="border-info/20 bg-info/5">
                <CardContent className="pt-6">
                    <div className="flex gap-3">
                        <div className="text-info">
                            <SettingsIcon className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                                Platform Configuration
                            </p>
                            <p className="text-sm text-info">
                                All API keys and credentials are encrypted using AES-256-GCM.
                                Set your <code className="bg-info/10 px-1 py-0.5 rounded text-xs">ENCRYPTION_SECRET</code> environment variable for secure storage.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
