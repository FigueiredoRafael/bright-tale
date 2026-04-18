"use client";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

export type ProviderId = "gemini" | "openai" | "anthropic" | "ollama" | "manual";

export interface ModelOption {
    id: string;
    label: string;
    note?: string;
}

export const MODELS_BY_PROVIDER: Record<ProviderId, ModelOption[]> = {
    ollama: [
        { id: "gemma4:e4b", label: "Gemma 4 (4B)", note: "local · Google · partial GPU" },
        { id: "tinyllama:latest", label: "TinyLlama 1B", note: "local · ultra leve · teste" },
        { id: "llama3.1:8b", label: "Llama 3.1 8B", note: "local · zero custo" },
        { id: "qwen2.5:7b", label: "Qwen 2.5 7B", note: "local · bom JSON" },
        { id: "mistral-nemo:12b", label: "Mistral Nemo 12B", note: "local · qualidade" },
    ],
    gemini: [
        { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "free tier · rápido" },
        { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "qualidade alta" },
    ],
    openai: [
        { id: "gpt-4o-mini", label: "GPT-4o mini", note: "barato + rápido" },
        { id: "gpt-4o", label: "GPT-4o", note: "qualidade alta" },
        { id: "o1-mini", label: "o1 mini", note: "raciocínio" },
    ],
    anthropic: [
        { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "barato + rápido" },
        { id: "claude-sonnet-4-5-20250514", label: "Claude Sonnet 4.5", note: "balanceado" },
        { id: "claude-opus-4-5-20250514", label: "Claude Opus 4.5", note: "máx qualidade" },
    ],
    manual: [
        { id: "manual", label: "Manual paste", note: "emits input to Axiom · no LLM call" },
    ],
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
    ollama: "Local (Ollama)",
    gemini: "Gemini",
    openai: "OpenAI",
    anthropic: "Anthropic",
    manual: "Manual",
};

const DEFAULT_PROVIDERS: ProviderId[] = ["gemini", "openai", "anthropic", "ollama"];

interface Props {
    provider: ProviderId;
    model: string;
    recommended?: { provider: string | null; model: string | null };
    onProviderChange: (p: ProviderId) => void;
    onModelChange: (m: string) => void;
    /** Providers to show in the grid. Defaults to the 4 LLM providers (no manual). */
    providers?: ProviderId[];
}

export function ModelPicker({ provider, model, recommended, onProviderChange, onModelChange, providers }: Props) {
    const visibleProviders = providers ?? DEFAULT_PROVIDERS;
    const models = MODELS_BY_PROVIDER[provider];

    return (
        <div className="space-y-3 pt-3 border-t">
            <div className="space-y-2">
                <Label className="text-xs">Provider</Label>
                <div className={`grid gap-2 ${visibleProviders.length >= 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-4"}`}>
                    {visibleProviders.map((p) => {
                        const isRecommended = recommended?.provider === p;
                        return (
                            <button
                                key={p}
                                onClick={() => onProviderChange(p)}
                                className={`relative text-left p-2 rounded-md border-2 transition-all ${provider === p
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-muted-foreground/30"
                                    }`}
                            >
                                <div className="text-sm font-medium">{PROVIDER_LABELS[p]}</div>
                                {isRecommended && (
                                    <Badge variant="secondary" className="absolute top-1 right-1 text-[9px] gap-0.5 px-1">
                                        <Sparkles className="h-2 w-2" /> rec
                                    </Badge>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-xs">Modelo</Label>
                <div className="grid grid-cols-2 gap-2">
                    {models.map((m) => {
                        const isRecommended = recommended?.provider === provider && recommended?.model === m.id;
                        return (
                            <button
                                key={m.id}
                                onClick={() => onModelChange(m.id)}
                                className={`relative text-left p-2 rounded-md border-2 transition-all ${model === m.id
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-muted-foreground/30"
                                    }`}
                            >
                                <div className="text-xs font-medium pr-12">{m.label}</div>
                                {m.note && <div className="text-[10px] text-muted-foreground mt-0.5">{m.note}</div>}
                                {isRecommended && (
                                    <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[9px] gap-0.5 px-1">
                                        <Sparkles className="h-2 w-2" /> recommended
                                    </Badge>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
