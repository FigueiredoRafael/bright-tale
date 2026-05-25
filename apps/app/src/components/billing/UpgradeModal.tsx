"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, ArrowRight, AlertCircle, Check } from "lucide-react";
import { useBillingStatus } from "@/hooks/useBillingStatus";

interface Plan {
    id: "free" | "starter" | "creator" | "pro";
    displayName: string;
    credits: number;
    usdMonthly: number;
    features: string[];
}

const PLAN_ORDER: Plan["id"][] = ["free", "starter", "creator", "pro"];

interface Props {
    open: boolean;
    reason: string | null;
    onClose: () => void;
}

export function UpgradeModal({ open, reason, onClose }: Props) {
    const router = useRouter();
    const { status } = useBillingStatus();
    const [plans, setPlans] = useState<Plan[]>([]);

    useEffect(() => {
        if (!open || plans.length > 0) return;
        fetch("/api/billing/plans")
            .then((r) => r.json())
            .then((j) => setPlans(j?.data?.plans ?? []));
    }, [open, plans.length]);

    const currentPlanId = status?.plan.id ?? "free";
    const currentIdx = PLAN_ORDER.indexOf(currentPlanId);
    // Suggest the next tier up, or Creator if on Free (the "Popular" choice).
    const suggestedId: Plan["id"] = currentIdx < 0 || currentPlanId === "free"
        ? "creator"
        : (PLAN_ORDER[Math.min(currentIdx + 1, PLAN_ORDER.length - 1)] as Plan["id"]);
    const suggested = plans.find((p) => p.id === suggestedId);

    function goToBilling() {
        onClose();
        router.push("/settings/billing");
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-amber-500" /> Créditos insuficientes
                    </DialogTitle>
                    <DialogDescription>
                        {reason ?? "Você bateu o limite do plano atual."}
                    </DialogDescription>
                </DialogHeader>

                {status && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Plano atual</span>
                            <span className="font-medium">{status.plan.displayName}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Créditos restantes</span>
                            <span className="font-mono tabular-nums">
                                {status.credits.available.toLocaleString("pt-BR")} / {(status.credits.creditsTotal + status.credits.creditsAddon).toLocaleString("pt-BR")}
                            </span>
                        </div>
                        {status.credits.creditsResetAt && (
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Reseta em {new Date(status.credits.creditsResetAt).toLocaleDateString("pt-BR")}
                            </div>
                        )}
                    </div>
                )}

                {suggested && suggested.id !== "free" && (
                    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                <span className="font-semibold">Upgrade pra {suggested.displayName}</span>
                                {suggested.id === "creator" && <Badge className="text-[10px]">Popular</Badge>}
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-bold">${suggested.usdMonthly}</div>
                                <div className="text-[10px] text-muted-foreground">/mês</div>
                            </div>
                        </div>
                        <div className="text-sm font-medium">
                            {suggested.credits.toLocaleString("pt-BR")} créditos/mês
                            <span className="text-muted-foreground ml-1">
                                ({Math.round(suggested.credits / (status?.plan.credits || 1000))}x mais)
                            </span>
                        </div>
                        <ul className="text-xs space-y-1">
                            {suggested.features.slice(0, 4).map((f, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                    <Check className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                                    <span>{f}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={onClose} className="flex-1">
                        Agora não
                    </Button>
                    <Button onClick={goToBilling} className="flex-1">
                        Ver planos <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
