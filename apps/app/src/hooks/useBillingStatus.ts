"use client";

import { useEffect, useState, useCallback } from "react";

export interface BillingStatus {
    plan: { id: "free" | "starter" | "creator" | "pro"; displayName: string; credits: number; usdMonthly: number; billingCycle: "monthly" | "annual" | null };
    /** Full CreditBalance from V2-006.4 — includes creditsReserved, signupBonus, unlimited sentinel */
    credits: {
        unlimited: boolean;
        creditsTotal: number;
        creditsUsed: number;
        creditsAddon: number;
        /** Credits currently reserved (held, not yet committed). V2-006. */
        creditsReserved: number;
        creditsResetAt: string | null;
        available: number;
        signupBonusCredits: number;
        signupBonusExpiresAt: string | null;
    };
    subscription: { stripeCustomerId: string | null; stripeSubscriptionId: string | null; planStartedAt: string | null; planExpiresAt: string | null };
}

/** Hook to load and refresh the current org's billing status. */
export function useBillingStatus(pollMs?: number) {
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const refetch = useCallback(async () => {
        try {
            const res = await fetch("/api/billing/status");
            const json = await res.json();
            if (json?.data) setStatus(json.data as BillingStatus);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refetch();
        if (!pollMs) return;
        const t = setInterval(() => void refetch(), pollMs);
        return () => clearInterval(t);
    }, [pollMs, refetch]);

    return { status, loading, refetch };
}

export function creditUsagePct(status: BillingStatus | null): number {
    if (!status) return 0;
    const cap = status.credits.creditsTotal + status.credits.creditsAddon;
    if (cap === 0) return 0;
    return Math.min(100, (status.credits.creditsUsed / cap) * 100);
}
