"use client";

import { Lightbulb, Search, Sparkles, Check } from "lucide-react";

type Step = "brainstorm" | "research" | "drafts";

const STEPS: { id: Step; label: string; icon: typeof Lightbulb }[] = [
    { id: "brainstorm", label: "Ideia", icon: Lightbulb },
    { id: "research", label: "Pesquisa", icon: Search },
    { id: "drafts", label: "Conteúdo", icon: Sparkles },
];

interface Props {
    current: Step;
}

export function WizardStepper({ current }: Props) {
    const currentIdx = STEPS.findIndex((s) => s.id === current);
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {STEPS.map((s, i) => {
                const done = i < currentIdx;
                const active = i === currentIdx;
                const Icon = s.icon;
                return (
                    <span key={s.id} className="flex items-center gap-2">
                        <span
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
                                active
                                    ? "bg-primary/10 text-primary font-medium"
                                    : done
                                        ? "text-foreground"
                                        : ""
                            }`}
                        >
                            {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                            {s.label}
                        </span>
                        {i < STEPS.length - 1 && <span className="text-muted-foreground/40">→</span>}
                    </span>
                );
            })}
        </div>
    );
}
