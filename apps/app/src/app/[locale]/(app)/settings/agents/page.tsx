"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Layers, Loader2, Lock, Shield, SlidersHorizontal, Users } from "lucide-react";
import { MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";

const PROVIDERS = ["gemini", "openai", "anthropic", "ollama"] as const;

interface AgentPrompt {
    id: string;
    name: string;
    slug: string;
    stage: string;
    instructions: string;
    recommended_provider: string | null;
    recommended_model: string | null;
    updated_at: string;
}

function modelsForProvider(p: string): string[] {
    if (p in MODELS_BY_PROVIDER) {
        return MODELS_BY_PROVIDER[p as ProviderId].map((m) => m.id);
    }
    return [];
}

// F2-026: read-only view for prompts. Editing lives in web/admin.
// Provider + model are editable by admins from here.
export default function AgentsSettingsPage() {
    const params = useParams<{ locale: string }>();
    const locale = params?.locale ?? "en";
    const { toast } = useToast();
    const [agents, setAgents] = useState<AgentPrompt[]>([]);
    const [selected, setSelected] = useState<AgentPrompt | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [agentsRes, meRes] = await Promise.all([
                    fetch("/api/agents"),
                    fetch("/api/users/me"),
                ]);
                const agentsJson = await agentsRes.json();
                const meJson = await meRes.json();
                if (agentsJson.data?.agents) {
                    setAgents(agentsJson.data.agents);
                    if (agentsJson.data.agents.length > 0) setSelected(agentsJson.data.agents[0]);
                }
                if (meJson?.data?.role === "admin") setIsAdmin(true);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function handleSaveRoute() {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/agents/${selected.slug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recommended_provider: selected.recommended_provider || null,
                    recommended_model: selected.recommended_model || null,
                }),
            });
            const json = await res.json();
            if (json?.error) throw new Error(json.error.message);
            setAgents((prev) => prev.map((a) => a.id === selected.id ? { ...a, ...selected } : a));
            toast({ title: "Saved", description: `${selected.name} default updated.` });
        } catch (err: unknown) {
            toast({
                title: "Error",
                description: err instanceof Error ? err.message : "Failed to save",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const currentProvider = selected?.recommended_provider ?? "";
    const modelOptions = currentProvider ? modelsForProvider(currentProvider) : [];

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Agentes</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Veja as instruções dos agentes que geram o seu conteúdo. A edição é feita pelo time de produto
                    no console de administração para garantir consistência entre usuários.
                </p>
            </div>

            <div className="flex gap-3 pb-4 border-b">
                <Link
                    href={`/${locale}/personas`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <Users className="h-4 w-4" />
                    Personas
                </Link>
                <Link
                    href={`/${locale}/settings/agents/personas/guardrails`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <Shield className="h-4 w-4" />
                    Guardrails
                </Link>
                <Link
                    href={`/${locale}/settings/agents/personas/archetypes`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <Layers className="h-4 w-4" />
                    Archetypes
                </Link>
                <Link
                    href={`/${locale}/settings/agents/pipeline`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <SlidersHorizontal className="h-4 w-4" />
                    Pipeline
                </Link>
            </div>

            <div className="grid grid-cols-[260px_1fr] gap-6">
                <nav className="space-y-1">
                    {agents.map((a) => (
                        <button
                            key={a.id}
                            onClick={() => setSelected(a)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                selected?.id === a.id
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "hover:bg-muted/50"
                            }`}
                        >
                            <div className="truncate">{a.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                {a.slug}
                            </div>
                        </button>
                    ))}
                </nav>

                {selected && (
                    <div className="space-y-4">
                        {/* Provider + model config (admin-editable) */}
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base">Default provider &amp; model</CardTitle>
                                        <CardDescription className="mt-0.5">
                                            Applied when an engine loads and there is no project-level override.
                                        </CardDescription>
                                    </div>
                                    {!isAdmin && (
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Lock className="h-3 w-3" />
                                            Read only
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Provider</Label>
                                        <Select
                                            value={selected.recommended_provider ?? "__none__"}
                                            disabled={!isAdmin}
                                            onValueChange={(v) =>
                                                setSelected((s) => s ? {
                                                    ...s,
                                                    recommended_provider: v === "__none__" ? null : v,
                                                    recommended_model: null,
                                                } : s)
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Inherited from pipeline settings" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Inherited from pipeline settings</SelectItem>
                                                {PROVIDERS.map((p) => (
                                                    <SelectItem key={p} value={p}>
                                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Model</Label>
                                        <Select
                                            value={selected.recommended_model ?? "__none__"}
                                            disabled={!isAdmin || !currentProvider}
                                            onValueChange={(v) =>
                                                setSelected((s) => s ? {
                                                    ...s,
                                                    recommended_model: v === "__none__" ? null : v,
                                                } : s)
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Provider default" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Provider default</SelectItem>
                                                {modelOptions.map((m) => (
                                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="flex justify-end">
                                        <Button size="sm" onClick={handleSaveRoute} disabled={saving}>
                                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Prompt (read-only) */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>{selected.name}</CardTitle>
                                        <CardDescription className="mt-1 flex items-center gap-2">
                                            <span className="font-mono text-xs">{selected.slug}</span>
                                            <span>·</span>
                                            <Badge variant="secondary" className="text-[10px]">{selected.stage}</Badge>
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Lock className="h-3 w-3" />
                                        Somente leitura
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/40 rounded-md p-4 max-h-[600px] overflow-y-auto">
                                    {selected.instructions}
                                </pre>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
