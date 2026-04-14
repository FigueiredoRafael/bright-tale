"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";
import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";

interface Props {
    open: boolean;
    title: string;
    description: string;
    initialProvider?: ProviderId;
    initialModel?: string;
    onConfirm: (provider: ProviderId, model: string) => Promise<void> | void;
    onClose: () => void;
}

export function ConfirmRegenerateModal({
    open,
    title,
    description,
    initialProvider = "ollama",
    initialModel = "qwen2.5:7b",
    onConfirm,
    onClose,
}: Props) {
    const [provider, setProvider] = useState<ProviderId>(initialProvider);
    const [model, setModel] = useState<string>(initialModel);
    const [busy, setBusy] = useState(false);

    async function handleConfirm() {
        if (busy) return;
        setBusy(true);
        try {
            await onConfirm(provider, model);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RefreshCw className="h-5 w-5 text-primary" /> {title}
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <ModelPicker
                        provider={provider}
                        model={model}
                        recommended={{ provider: null, model: null }}
                        onProviderChange={(p) => {
                            setProvider(p);
                            setModel(MODELS_BY_PROVIDER[p][0].id);
                        }}
                        onModelChange={setModel}
                    />

                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                        <div>
                            {provider === "ollama"
                                ? "Ollama é local — sem custo de créditos. Pode rodar à vontade."
                                : "Esse provider consome créditos da sua conta. Refazer cobra de novo."}
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                        Refazer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
