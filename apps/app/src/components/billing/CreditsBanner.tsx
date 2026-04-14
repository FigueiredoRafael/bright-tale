"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { useBillingStatus, creditUsagePct } from "@/hooks/useBillingStatus";

/**
 * Persistent banner at the top of the app when credit usage crosses 80% / 95%.
 * Dismissible per-session (via sessionStorage) to avoid nagging, but returns
 * on the next browser session or after credits reset.
 */
export function CreditsBanner() {
    const { status } = useBillingStatus(60_000); // refresh every minute
    const [dismissed, setDismissed] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return sessionStorage.getItem("credits-banner-dismissed");
    });
    const router = useRouter();

    if (!status) return null;
    const pct = creditUsagePct(status);
    const tier = pct >= 95 ? "critical" : pct >= 80 ? "warning" : null;
    if (!tier) return null;

    const key = `${tier}-${status.credits.resetAt ?? ""}`;
    if (dismissed === key) return null;

    const isCritical = tier === "critical";
    const cap = status.credits.total + status.credits.addon;

    function dismiss() {
        setDismissed(key);
        if (typeof window !== "undefined") {
            sessionStorage.setItem("credits-banner-dismissed", key);
        }
    }

    return (
        <div
            className={`flex items-center justify-between gap-3 px-4 py-2 text-xs border-b ${
                isCritical
                    ? "bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-400"
                    : "bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-300"
            }`}
        >
            <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="truncate">
                    {isCritical
                        ? `Só restam ${status.credits.remaining.toLocaleString("pt-BR")} créditos (${(100 - pct).toFixed(0)}% do plano).`
                        : `Você já usou ${pct.toFixed(0)}% dos ${cap.toLocaleString("pt-BR")} créditos do mês.`}
                </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={() => router.push("/settings/billing")}
                    className="underline font-medium hover:opacity-80"
                >
                    Fazer upgrade
                </button>
                <button onClick={dismiss} className="opacity-60 hover:opacity-100" aria-label="Dispensar">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}
