"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Loader2, Pause, XCircle } from "lucide-react";
import { useJobEvents } from "@/hooks/useJobEvents";

interface Props {
    open: boolean;
    sessionId: string;
    sseUrl: string;
    title?: string;
    /** When true, fetch all events from the beginning (reconnecting to existing session). */
    reconnecting?: boolean;
    /**
     * ISO timestamp anchor for the SSE `since` filter. The job_events stream
     * is keyed by draftId, so successive stages (canonical-core → produce →
     * review) share a session — without an anchor scoped to *this* run, the
     * modal would pick up the previous stage's `completed` event and fire
     * onComplete immediately. Parents should capture this BEFORE dispatching
     * the action that emits the events.
     */
    since?: string;
    onComplete?: () => void;
    onFailed?: (message: string) => void;
    onClose: () => void;
}

export function GenerationProgressModal({ open, sessionId, sseUrl, title = "Gerando ideias", reconnecting, since, onComplete, onFailed, onClose }: Props) {
    const [openedAt, setOpenedAt] = useState<string | null>(null);
    useEffect(() => {
        if (!open) {
            setOpenedAt(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on close
            return;
        }
        if (reconnecting) {
            setOpenedAt('1970-01-01T00:00:00Z');
            return;
        }
        // Prefer the parent-supplied anchor (captured at action-start time).
        // Fall back to a tight 1s lookback only when the parent didn't pass
        // one — wide enough for clock skew, narrow enough not to swallow the
        // prior stage's terminal event.
        setOpenedAt(since ?? new Date(Date.now() - 1_000).toISOString());
    }, [open, reconnecting, since]);

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

    // Stash the latest callbacks in refs so the completion timer effect can
    // depend only on `status` (not on the inline arrow callbacks the parent
    // recreates every render — those would otherwise re-run the effect and
    // perpetually reset the 1.5s timer, never letting it fire).
    const onCompleteRef = useRef(onComplete);
    const onFailedRef = useRef(onFailed);
    useEffect(() => {
        onCompleteRef.current = onComplete;
        onFailedRef.current = onFailed;
    }, [onComplete, onFailed]);

    useEffect(() => {
        if (status === "completed") {
            // Hold the modal open for a moment so the user can see the green
            // checkmark + final event log before the parent removes us. Without
            // this delay autopilot can flash the modal open→close in <100ms
            // and the run looks like it never happened.
            const t = setTimeout(() => onCompleteRef.current?.(), 1500);
            return () => clearTimeout(t);
        }
        if (status === "failed") {
            const msg = events.find((e) => e.stage === "failed")?.message ?? "Falhou";
            onFailedRef.current?.(msg);
        }
    }, [status, events]);

    const currentMessage = events[events.length - 1]?.message ?? "Iniciando…";
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

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {status === "completed" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : status === "failed" ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                        ) : status === "aborted" ? (
                            <Pause className="h-5 w-5 text-amber-600" />
                        ) : (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        )}
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {currentMessage}
                        <span className="ml-2 text-xs text-muted-foreground">({fmtElapsed(elapsed)})</span>
                    </DialogDescription>
                </DialogHeader>

                {/* Chronological event log — every emitJobEvent shows up here in
                    order. Better than a fixed checklist for multi-stage jobs
                    (production = canonical-core + produce + review, which all
                    emit the same `calling_provider` stage with different msgs). */}
                <ul className="space-y-2 py-2 max-h-[280px] overflow-y-auto">
                    {dedupedEvents.map((ev, i) => {
                        const isLast = i === dedupedEvents.length - 1;
                        const isLive = isLast && status === "streaming";
                        const isFailed = ev.stage === "failed";
                        const isAborted = ev.stage === "aborted";
                        return (
                            <li key={ev.id} className="flex items-start gap-3 text-sm">
                                {isFailed ? (
                                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                ) : isAborted ? (
                                    <Pause className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                ) : isLive ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0 mt-0.5" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                                )}
                                <span className={`flex-1 ${
                                    isFailed
                                        ? "text-red-600 dark:text-red-400"
                                        : isAborted
                                            ? "text-amber-700 dark:text-amber-400"
                                            : isLive
                                                ? "text-foreground font-medium"
                                                : "text-muted-foreground"
                                }`}>
                                    {ev.message}
                                </span>
                                {(() => {
                                    const d = stepDurationFor(dedupedEvents, i);
                                    if (d == null || d < 2) return null;
                                    return <span className="text-[10px] text-muted-foreground/70 shrink-0 mt-1 tabular-nums">{fmtElapsed(d)}</span>;
                                })()}
                            </li>
                        );
                    })}
                    {events.length === 0 && status === "streaming" && (
                        <li className="flex items-center gap-3 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" /> Iniciando…
                        </li>
                    )}
                </ul>
                {stalled && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                        Sem novidades há {fmtElapsed(secondsSinceLastEvent)}. Pode ser o Ollama lento, ou o worker do Inngest precisa reiniciar (mata e roda <code>npm run dev</code> de novo).
                    </div>
                )}

                {status === "failed" && (
                    <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                        {events.find((e) => e.stage === "failed")?.message ?? "Erro desconhecido"}
                    </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">Sessão: {sessionId.slice(0, 8)}…</p>
            </DialogContent>
        </Dialog>
    );
}
