"use client";

import { useEffect, useState } from "react";

export interface JobEvent {
    id: string;
    stage: "queued" | "loading_prompt" | "calling_provider" | "parsing_output" | "saving" | "completed" | "failed" | "aborted";
    message: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export interface UseJobEventsState {
    events: JobEvent[];
    status: "idle" | "streaming" | "completed" | "failed" | "aborted" | "error";
    error: string | null;
}

/**
 * Subscribe to job progress events via SSE.
 * Pass an empty string to disable.
 */
export function useJobEvents(sseUrl: string): UseJobEventsState {
    const [events, setEvents] = useState<JobEvent[]>([]);
    const [status, setStatus] = useState<UseJobEventsState["status"]>(sseUrl ? "streaming" : "idle");
    const [error, setError] = useState<string | null>(null);
    const [prevSseUrl, setPrevSseUrl] = useState(sseUrl);

    if (prevSseUrl !== sseUrl) {
        setPrevSseUrl(sseUrl);
        setEvents([]);
        setStatus(sseUrl ? "streaming" : "idle");
        setError(null);
    }

    useEffect(() => {
        if (!sseUrl) return;

        const source = new EventSource(sseUrl);

        source.onmessage = (e) => {
            try {
                const ev = JSON.parse(e.data) as JobEvent;
                setEvents((prev) => [...prev, ev]);
                if (ev.stage === "completed") {
                    setStatus("completed");
                    source.close();
                } else if (ev.stage === "failed") {
                    setStatus("failed");
                    source.close();
                } else if (ev.stage === "aborted") {
                    setStatus("aborted");
                    source.close();
                }
            } catch {
                // ignore malformed payloads
            }
        };

        source.onerror = () => {
            // EventSource auto-reconnects on transient errors; only mark error
            // if the connection is fully closed and we never completed.
            if (source.readyState === EventSource.CLOSED) {
                setStatus((s) => (s === "streaming" ? "error" : s));
                setError("Conexão perdida");
            }
        };

        return () => {
            source.close();
        };
    }, [sseUrl]);

    return { events, status, error };
}
