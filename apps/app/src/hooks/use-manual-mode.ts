import { useState, useEffect } from "react";

/**
 * Controls visibility of manual AI mode (copy prompt → paste output).
 * Currently always enabled. When admin-only restriction is needed,
 * check user_roles table for admin role and return false for non-admins.
 *
 * To disable for non-admins later:
 * 1. Add GET /api/auth/me endpoint that returns { role: 'admin' | 'user' }
 * 2. Fetch here and set enabled = role === 'admin'
 */
export function useManualMode(): { enabled: boolean; loading: boolean } {
    const [enabled, setEnabled] = useState(true);
    const [loading, setLoading] = useState(false);

    // TODO: When admin-only restriction is needed, uncomment:
    // useEffect(() => {
    //     setLoading(true);
    //     fetch("/api/auth/me")
    //         .then((r) => r.json())
    //         .then((json) => setEnabled(json.data?.role === "admin"))
    //         .catch(() => setEnabled(false))
    //         .finally(() => setLoading(false));
    // }, []);

    return { enabled, loading };
}
