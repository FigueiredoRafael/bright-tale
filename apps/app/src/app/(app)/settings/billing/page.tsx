"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Sparkles, CreditCard, Zap } from "lucide-react";
import { toast } from "sonner";

interface Addon {
    id: "pack_small" | "pack_medium" | "pack_large";
    credits: number;
    usdPrice: number;
}

type PlanId = "free" | "starter" | "creator" | "pro";
interface Plan {
    id: PlanId;
    displayName: string;
    credits: number;
    usdMonthly: number;
    usdAnnual: number;
    features: string[];
}
interface Status {
    plan: { id: PlanId; displayName: string; credits: number; billingCycle: "monthly" | "annual" | null };
    credits: { total: number; used: number; addon: number; remaining: number; resetAt: string | null };
    subscription: { stripeCustomerId: string | null; stripeSubscriptionId: string | null; planExpiresAt: string | null };
}

export default function BillingPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [addons, setAddons] = useState<Addon[]>([]);
    const [status, setStatus] = useState<Status | null>(null);
    const [loading, setLoading] = useState(true);
    const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
    const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
    const [pendingAddon, setPendingAddon] = useState<Addon["id"] | null>(null);
    const [openingPortal, setOpeningPortal] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [p, a, s] = await Promise.all([
                    fetch("/api/billing/plans").then((r) => r.json()),
                    fetch("/api/billing/addons").then((r) => r.json()),
                    fetch("/api/billing/status").then((r) => r.json()),
                ]);
                setPlans(p?.data?.plans ?? []);
                setAddons(a?.data?.packs ?? []);
                setStatus(s?.data ?? null);
                if (s?.data?.plan?.billingCycle) setCycle(s.data.plan.billingCycle);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const usagePct = useMemo(() => {
        if (!status) return 0;
        const total = status.credits.total + status.credits.addon;
        if (total === 0) return 0;
        return Math.min(100, (status.credits.used / total) * 100);
    }, [status]);

    async function startCheckout(planId: PlanId) {
        if (planId === "free" || pendingPlan) return;
        setPendingPlan(planId);
        try {
            const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId, billingCycle: cycle }),
            });
            const json = await res.json();
            if (json?.error || !json?.data?.url) {
                toast.error(json?.error?.message ?? "Falha ao iniciar checkout", {
                    description: "Verifica se os STRIPE_PRICE_* envs estão configurados.",
                });
                setPendingPlan(null);
                return;
            }
            window.location.href = json.data.url;
        } catch {
            toast.error("Falha ao iniciar checkout");
            setPendingPlan(null);
        }
    }

    async function buyAddon(packId: Addon["id"]) {
        if (pendingAddon) return;
        setPendingAddon(packId);
        try {
            const res = await fetch("/api/billing/addons/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ packId }),
            });
            const json = await res.json();
            if (json?.error || !json?.data?.url) {
                toast.error(json?.error?.message ?? "Falha ao iniciar compra", {
                    description: "Verifica se os STRIPE_PRICE_ADDON_* envs estão configurados.",
                });
                setPendingAddon(null);
                return;
            }
            window.location.href = json.data.url;
        } catch {
            toast.error("Falha ao iniciar compra");
            setPendingAddon(null);
        }
    }

    async function openPortal() {
        if (openingPortal) return;
        setOpeningPortal(true);
        try {
            const res = await fetch("/api/billing/portal", { method: "POST" });
            const json = await res.json();
            if (json?.error || !json?.data?.url) {
                toast.error(json?.error?.message ?? "Falha ao abrir portal");
                return;
            }
            window.location.href = json.data.url;
        } finally {
            setOpeningPortal(false);
        }
    }

    if (loading) {
        return <div className="p-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
    }

    const currentPlanId = status?.plan.id ?? "free";

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <CreditCard className="h-5 w-5" /> Plano & créditos
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Seu plano atual, créditos e opções de upgrade.
                </p>
            </div>

            {/* Current status */}
            {status && (
                <Card>
                    <CardContent className="py-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Plano atual</div>
                                <div className="flex items-center gap-2">
                                    <div className="text-2xl font-bold">{status.plan.displayName}</div>
                                    {status.plan.billingCycle && (
                                        <Badge variant="outline" className="capitalize">{status.plan.billingCycle === "annual" ? "anual" : "mensal"}</Badge>
                                    )}
                                </div>
                                {status.subscription.planExpiresAt && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Renova em {new Date(status.subscription.planExpiresAt).toLocaleDateString("pt-BR")}
                                    </div>
                                )}
                            </div>
                            {status.subscription.stripeCustomerId && (
                                <Button variant="outline" size="sm" onClick={openPortal} disabled={openingPortal}>
                                    {openingPortal ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                                    Gerenciar assinatura
                                </Button>
                            )}
                        </div>

                        <div className="mt-5">
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-muted-foreground">Créditos usados</span>
                                <span className="tabular-nums">
                                    {status.credits.used.toLocaleString("pt-BR")} / {(status.credits.total + status.credits.addon).toLocaleString("pt-BR")}
                                </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${usagePct > 95 ? "bg-red-500" : usagePct > 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${usagePct}%` }} />
                            </div>
                            {status.credits.resetAt && (
                                <div className="text-[11px] text-muted-foreground mt-1.5">
                                    Reseta em {new Date(status.credits.resetAt).toLocaleDateString("pt-BR")}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Cycle toggle */}
            <div className="flex items-center justify-center">
                <div className="inline-flex rounded-md border p-0.5">
                    <button
                        className={`px-4 py-1.5 text-sm rounded ${cycle === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                        onClick={() => setCycle("monthly")}
                    >
                        Mensal
                    </button>
                    <button
                        className={`px-4 py-1.5 text-sm rounded flex items-center gap-1.5 ${cycle === "annual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                        onClick={() => setCycle("annual")}
                    >
                        Anual
                        <Badge variant="outline" className="text-[10px]">-22%</Badge>
                    </button>
                </div>
            </div>

            {/* Plans grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {plans.map((p) => {
                    const price = cycle === "annual" ? p.usdAnnual : p.usdMonthly;
                    const isCurrent = currentPlanId === p.id;
                    const isPro = p.id === "pro";
                    const isCreator = p.id === "creator";
                    return (
                        <Card key={p.id} className={`relative ${isPro ? "border-primary/50 bg-gradient-to-b from-primary/5 to-transparent" : ""} ${isCurrent ? "ring-2 ring-primary/40" : ""}`}>
                            {isCreator && (
                                <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                                    <Badge className="text-[10px]">Popular</Badge>
                                </div>
                            )}
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">{p.displayName}</CardTitle>
                                <div className="flex items-baseline gap-1 mt-2">
                                    <span className="text-3xl font-bold">R$ {(price * 5.5).toFixed(0)}</span>
                                    <span className="text-xs text-muted-foreground">/mês</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    ${price}/mo{cycle === "annual" ? " · cobrado anualmente" : ""}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm font-medium mb-3 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                                    {p.credits.toLocaleString("pt-BR")} créditos/mês
                                </div>
                                <ul className="space-y-1.5 text-xs mb-4 min-h-[160px]">
                                    {p.features.map((f, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <Check className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                {isCurrent ? (
                                    <Button variant="outline" disabled className="w-full">
                                        Plano atual
                                    </Button>
                                ) : p.id === "free" ? (
                                    <Button variant="outline" disabled className="w-full">
                                        Gratuito
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => startCheckout(p.id)}
                                        disabled={pendingPlan !== null}
                                        className="w-full"
                                        variant={isPro ? "default" : "outline"}
                                    >
                                        {pendingPlan === p.id ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                                        Escolher {p.displayName}
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* F3-005 Add-on packs */}
            {addons.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-500" /> Créditos avulsos
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Precisou de mais créditos no mês? Compre packs one-time que somam aos do plano. Não expiram até usar.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {addons.map((a) => (
                                <div key={a.id} className="border rounded-lg p-4 space-y-2">
                                    <div className="flex items-baseline justify-between">
                                        <div>
                                            <span className="text-xl font-bold">R$ {(a.usdPrice * 5.5).toFixed(0)}</span>
                                            <span className="text-xs text-muted-foreground ml-1.5">${a.usdPrice}</span>
                                        </div>
                                        <Badge variant="outline" className="text-[10px]">pack</Badge>
                                    </div>
                                    <div className="text-sm flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                                        <span className="font-medium">{a.credits.toLocaleString("pt-BR")}</span>
                                        <span className="text-muted-foreground">créditos</span>
                                    </div>
                                    <Button
                                        onClick={() => buyAddon(a.id)}
                                        disabled={pendingAddon !== null}
                                        variant="outline"
                                        className="w-full"
                                        size="sm"
                                    >
                                        {pendingAddon === a.id ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                                        Comprar
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <p className="text-xs text-muted-foreground text-center">
                Pagamento processado pelo Stripe. Cancele quando quiser no portal de assinatura.
            </p>
        </div>
    );
}
