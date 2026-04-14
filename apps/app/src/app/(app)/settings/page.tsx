"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Globe,
    Settings as SettingsIcon,
    ChevronRight,
    Users,
    User,
    TrendingUp,
    CreditCard,
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
    // User-facing settings only. Technical/global config (agent prompts, AI
    // providers, image generation, API keys) is admin-only and managed via the
    // web/admin app — not exposed here.
    const settingsCards: SettingsCard[] = [
        {
            title: "Perfil",
            description: "Seu nome, email e preferências da conta.",
            href: "/settings/profile",
            icon: <User className="h-6 w-6" />,
        },
        {
            title: "Time",
            description: "Convide pessoas pra colaborar nesse workspace, gerencie roles e permissões.",
            href: "/settings/team",
            icon: <Users className="h-6 w-6" />,
        },
        {
            title: "WordPress",
            description: "Conecte o site WordPress pra publicar posts direto da plataforma. Sem isso, dá pra marcar como publicado manualmente.",
            href: "/settings/wordpress",
            icon: <Globe className="h-6 w-6" />,
        },
        {
            title: "Plano & créditos",
            description: "Seu plano atual, créditos mensais, histórico de pagamento e upgrade.",
            href: "/settings/billing",
            icon: <CreditCard className="h-6 w-6" />,
        },
        {
            title: "Uso & custo",
            description: "Tokens gastos e custo estimado por mês, provider e formato. Ollama local é free; Gemini/Anthropic/OpenAI usam preços públicos.",
            href: "/settings/usage",
            icon: <TrendingUp className="h-6 w-6" />,
        },
    ];

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <SettingsIcon className="h-8 w-8 text-muted-foreground" />
                    <h1 className="text-3xl font-bold">Configurações</h1>
                </div>
                <p className="text-muted-foreground">
                    Sua conta, time e integração de publicação.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {settingsCards.map((card) => (
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
                                                <Badge variant={card.badgeVariant} className="mt-1">
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
                ))}
            </div>

            <Card className="border-muted bg-muted/30">
                <CardContent className="pt-5 pb-5">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        <strong className="text-foreground">Configurações técnicas</strong> (agentes de IA, provedores,
                        geração de imagens, chaves de API) são gerenciadas pelo time admin no painel separado.
                        Tudo já vem configurado quando o workspace é criado.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
