"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { UpgradeModal } from "./UpgradeModal";

interface UpgradeContextValue {
    /** Open the upgrade modal with an optional reason shown at the top. */
    showUpgrade: (reason?: string) => void;
    /** If the error's code is INSUFFICIENT_CREDITS, open the modal and return
     *  true (so the caller knows it was handled). Otherwise returns false. */
    handleMaybeCreditsError: (error: { code?: string; message?: string } | null | undefined) => boolean;
}

const UpgradeContext = createContext<UpgradeContextValue | null>(null);

export function UpgradeProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<string | null>(null);

    const showUpgrade = useCallback((r?: string) => {
        setReason(r ?? null);
        setOpen(true);
    }, []);

    const handleMaybeCreditsError = useCallback((error: { code?: string; message?: string } | null | undefined) => {
        if (!error || error.code !== "INSUFFICIENT_CREDITS") return false;
        showUpgrade(error.message ?? undefined);
        return true;
    }, [showUpgrade]);

    return (
        <UpgradeContext.Provider value={{ showUpgrade, handleMaybeCreditsError }}>
            {children}
            <UpgradeModal open={open} reason={reason} onClose={() => setOpen(false)} />
        </UpgradeContext.Provider>
    );
}

export function useUpgrade(): UpgradeContextValue {
    const ctx = useContext(UpgradeContext);
    if (!ctx) {
        // If called outside the provider, no-op. Makes it safe in tests/storybook.
        return { showUpgrade: () => {}, handleMaybeCreditsError: () => false };
    }
    return ctx;
}
