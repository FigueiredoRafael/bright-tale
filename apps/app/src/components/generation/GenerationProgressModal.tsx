"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useJobEvents } from "@/hooks/useJobEvents";

interface Props {
    open: boolean;
    sessionId: string;
    sseUrl: string;
    title?: string;
    onComplete?: () => void;
    onFailed?: (message: string) => void;
    onClose: () => void;
}

export function GenerationProgressModal({ open, sessionId, sseUrl, title = "Gerando ideias", onComplete, onFailed, onClose }: Props) {
    const { events, status } = useJobEvents(open ? sseUrl : "");
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!open) return;
        const start = Date.now();
        setElapsed(0);
        const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
        return () => clearInterval(t);
    }, [open]);

    useEffect(() => {
        if (status === "completed") onComplete?.();
        if (status === "failed") {
            const msg = events.find((e) => e.stage === "failed")?.message ?? "Falhou";
            onFailed?.(msg);
        }
    }, [status, events, onComplete, onFailed]);

    const currentMessage = events[events.length - 1]?.message ?? "Iniciando…";

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {status === "completed" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : status === "failed" ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                        ) : (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        )}
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {currentMessage}
                        <span className="ml-2 text-xs text-muted-foreground">({elapsed}s)</span>
                    </DialogDescription>
                </DialogHeader>

                {/* Chronological event log — every emitJobEvent shows up here in
                    order. Better than a fixed checklist for multi-stage jobs
                    (production = canonical-core + produce + review, which all
                    emit the same `calling_provider` stage with different msgs). */}
                <ul className="space-y-2 py-2 max-h-[280px] overflow-y-auto">
                    {events.map((ev, i) => {
                        const isLast = i === events.length - 1;
                        const isLive = isLast && status === "streaming";
                        const isFailed = ev.stage === "failed";
                        return (
                            <li key={ev.id} className="flex items-start gap-3 text-sm">
                                {isFailed ? (
                                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                ) : isLive ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0 mt-0.5" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                                )}
                                <span className={
                                    isFailed
                                        ? "text-red-600 dark:text-red-400"
                                        : isLive
                                            ? "text-foreground font-medium"
                                            : "text-muted-foreground"
                                }>
                                    {ev.message}
                                </span>
                            </li>
                        );
                    })}
                    {events.length === 0 && status === "streaming" && (
                        <li className="flex items-center gap-3 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" /> Iniciando…
                        </li>
                    )}
                </ul>

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
