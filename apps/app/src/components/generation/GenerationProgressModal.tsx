"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Loader2, XCircle, Circle } from "lucide-react";
import { useJobEvents, type JobEvent } from "@/hooks/useJobEvents";

const STAGE_ORDER: JobEvent["stage"][] = [
    "queued",
    "loading_prompt",
    "calling_provider",
    "parsing_output",
    "saving",
    "completed",
];

const STAGE_LABELS: Record<JobEvent["stage"], string> = {
    queued: "Na fila",
    loading_prompt: "Carregando agente",
    calling_provider: "Conversando com a IA",
    parsing_output: "Processando resposta",
    saving: "Salvando no banco",
    completed: "Concluído",
    failed: "Falhou",
};

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

    const reachedStages = useMemo(() => new Set(events.map((e) => e.stage)), [events]);
    const currentStage = events[events.length - 1]?.stage;
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

                <ul className="space-y-2 py-2">
                    {STAGE_ORDER.filter((s) => s !== "queued" || reachedStages.has("queued")).map((stage) => {
                        const reached = reachedStages.has(stage);
                        const isCurrent = currentStage === stage && status === "streaming";
                        const done = reached && !isCurrent;
                        return (
                            <li key={stage} className="flex items-center gap-3 text-sm">
                                {done ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                ) : isCurrent ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                                ) : (
                                    <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                )}
                                <span className={done ? "text-foreground" : isCurrent ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    {STAGE_LABELS[stage]}
                                </span>
                            </li>
                        );
                    })}
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
