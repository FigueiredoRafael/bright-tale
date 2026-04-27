"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Square, XCircle } from "lucide-react";
import { useJobEvents } from "@/hooks/useJobEvents";

interface Props {
    open: boolean;
    sessionId: string;
    sseUrl: string;
    cancelUrl?: string;
    title?: string;
    reconnecting?: boolean;
    onComplete?: () => void;
    onFailed?: (message: string) => void;
    onClose: () => void;
}

export function GenerationProgressFloat({ open, sessionId, sseUrl, cancelUrl, title = "Generating…", reconnecting, onComplete, onFailed, onClose }: Props) {
    const [collapsed, setCollapsed] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const [openedAt, setOpenedAt] = useState<string | null>(null);
    useEffect(() => {
        if (open) {
            setOpenedAt(reconnecting // eslint-disable-line react-hooks/set-state-in-effect -- compute timestamp once on open
                ? '1970-01-01T00:00:00Z'
                : new Date(Date.now() - 30_000).toISOString()
            );
        } else {
            setOpenedAt(null);  
        }
    }, [open, reconnecting]);

    const effectiveUrl = open && openedAt && sseUrl
        ? `${sseUrl}${sseUrl.includes("?") ? "&" : "?"}since=${encodeURIComponent(openedAt)}`
        : "";
    const { events, status } = useJobEvents(effectiveUrl);

    const startRef = useRef(0);
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!open) return;
        startRef.current = Date.now();
        setElapsed(0); // eslint-disable-line react-hooks/set-state-in-effect -- reset on open
        const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
        return () => clearInterval(t);
    }, [open]);

    useEffect(() => {
        if (status === "completed") {
            // Hold the float open briefly so users see the success state
            // before the parent unmounts us (autopilot otherwise flashes it).
            const t = setTimeout(() => onComplete?.(), 1500);
            return () => clearTimeout(t);
        }
        if (status === "failed") {
            const msg = events.find((e) => e.stage === "failed")?.message ?? "Failed";
            onFailed?.(msg);
        }
    }, [status, events, onComplete, onFailed]);

    const currentMessage = events[events.length - 1]?.message ?? "Starting…";
    const dedupedEvents = events.reduce<typeof events>((acc, ev) => {
        if (acc.length > 0 && acc[acc.length - 1].message === ev.message) return acc;
        acc.push(ev);
        return acc;
    }, []);

    const lastEventTimeRef = useRef(0);
    useEffect(() => { lastEventTimeRef.current = Date.now(); }, [events.length]);
    const [secondsSinceLastEvent, setSecondsSinceLastEvent] = useState(0);
    useEffect(() => {
        if (!open) return;
        lastEventTimeRef.current = Date.now();
        const t = setInterval(() => setSecondsSinceLastEvent(Math.floor((Date.now() - lastEventTimeRef.current) / 1000)), 1000);
        return () => clearInterval(t);
    }, [open]);
    const stalled = status === "streaming" && secondsSinceLastEvent > 60;

    function fmtElapsed(s: number) {
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}m${String(r).padStart(2, "0")}s`;
    }

    function stepDurationFor(list: typeof events, i: number): number | null {
        if (i === 0) return null;
        const prev = new Date(list[i - 1].created_at).getTime();
        const cur = new Date(list[i].created_at).getTime();
        return Math.round((cur - prev) / 1000);
    }

    if (!open) return null;

    const isDone = status === "completed";
    const isFailed = status === "failed";

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-background shadow-lg overflow-hidden transition-all">
            {/* Header — always visible */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
            >
                {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : isFailed ? (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                )}
                <span className="text-sm font-medium truncate flex-1">{title}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {fmtElapsed(elapsed)}
                </span>
                {collapsed
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                }
            </button>

            {/* Expandable body */}
            {!collapsed && (
                <div className="border-t px-3 pb-3">
                    {/* Current step */}
                    <p className="text-xs text-muted-foreground py-2">{currentMessage}</p>

                    {/* Event timeline */}
                    <ul className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {dedupedEvents.map((ev, i) => {
                            const isLast = i === dedupedEvents.length - 1;
                            const isLive = isLast && status === "streaming";
                            const evFailed = ev.stage === "failed";
                            return (
                                <li key={ev.id} className="flex items-start gap-2 text-xs">
                                    {evFailed ? (
                                        <XCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                                    ) : isLive ? (
                                        <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0 mt-0.5" />
                                    ) : (
                                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                                    )}
                                    <span className={`flex-1 ${
                                        evFailed
                                            ? "text-red-600 dark:text-red-400"
                                            : isLive
                                                ? "text-foreground font-medium"
                                                : "text-muted-foreground"
                                    }`}>
                                        {ev.message}
                                    </span>
                                    {(() => {
                                        const d = stepDurationFor(dedupedEvents, i);
                                        if (d == null || d < 2) return null;
                                        return <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">{fmtElapsed(d)}</span>;
                                    })()}
                                </li>
                            );
                        })}
                        {events.length === 0 && status === "streaming" && (
                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" /> Starting…
                            </li>
                        )}
                    </ul>

                    {stalled && (
                        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-[10px] text-amber-700 dark:text-amber-400 mt-2">
                            No updates for {fmtElapsed(secondsSinceLastEvent)}. Local model may still be processing.
                        </div>
                    )}

                    {isFailed && (
                        <div className="rounded border border-red-500/50 bg-red-500/10 p-1.5 text-xs text-red-600 dark:text-red-400 mt-2">
                            {events.find((e) => e.stage === "failed")?.message ?? "Unknown error"}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t">
                        <span className="text-[10px] text-muted-foreground">
                            {sessionId.slice(0, 8)}…
                        </span>
                        <div className="flex items-center gap-2">
                            {!isDone && !isFailed && cancelUrl && (
                                <button
                                    onClick={async () => {
                                        setCancelling(true);
                                        try {
                                            await fetch(cancelUrl, { method: 'POST' });
                                            onFailed?.('Cancelled by user');
                                        } catch {
                                            setCancelling(false);
                                        }
                                    }}
                                    disabled={cancelling}
                                    className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
                                >
                                    <Square className="h-2.5 w-2.5" />
                                    {cancelling ? 'Cancelling…' : 'Cancel'}
                                </button>
                            )}
                            {(isDone || isFailed) && (
                                <button
                                    onClick={onClose}
                                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Dismiss
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
