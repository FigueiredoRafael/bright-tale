"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Shield, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * /settings/security — end-user 2FA opt-in.
 *
 * Mirrors the admin MFA flow (apps/web/src/app/zadmin/mfa/page.tsx) but
 * is **opt-in only**. There is no AAL2 gate forcing users to enroll —
 * Supabase will challenge the factor at login if and only if the user
 * has a verified TOTP factor.
 *
 * States: loading | disabled | enrolling | enabled | error
 */

const ISSUER = "BrightTale";

type State =
  | { kind: "loading" }
  | { kind: "disabled" } // no verified factor
  | { kind: "enrolling"; factorId: string; secret: string; otpauthUri: string }
  | { kind: "enabled"; factorId: string; friendlyName: string | null; createdAt: string }
  | { kind: "error"; message: string };

export default function SecurityPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Initial load ────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    const sb = createClient();
    try {
      const { data: factors, error } = await sb.auth.mfa.listFactors();
      if (error) throw error;
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) {
        setState({
          kind: "enabled",
          factorId: verified.id,
          friendlyName: verified.friendly_name ?? null,
          createdAt: verified.created_at,
        });
      } else {
        setState({ kind: "disabled" });
      }
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Start enrollment ────────────────────────────────────────────────────
  const startEnroll = async () => {
    setErrorMsg(null);
    const sb = createClient();
    try {
      // Clean up any unverified factors first (Supabase keeps stale ones).
      const list = await sb.auth.mfa.listFactors();
      const stale = list.data?.totp?.filter((f) => f.status !== "verified") ?? [];
      for (const f of stale) {
        await sb.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await sb.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `${ISSUER} · ${new Date().toISOString().slice(0, 10)}`,
        issuer: ISSUER,
      });
      if (error) throw error;
      if (!data) throw new Error("No enrollment data returned");
      setState({
        kind: "enrolling",
        factorId: data.id,
        secret: data.totp.secret,
        otpauthUri: data.totp.uri,
      });
    } catch (e) {
      const msg = (e as Error).message || "Falha ao iniciar 2FA";
      setErrorMsg(msg);
      toast.error(msg);
    }
  };

  // ── Verify enrollment ───────────────────────────────────────────────────
  const verify = async () => {
    if (state.kind !== "enrolling") return;
    if (!/^\d{6}$/.test(code)) {
      setErrorMsg("Código deve ter 6 dígitos");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    const sb = createClient();
    try {
      const ch = await sb.auth.mfa.challenge({ factorId: state.factorId });
      if (ch.error) throw ch.error;
      const v = await sb.auth.mfa.verify({
        factorId: state.factorId,
        challengeId: ch.data.id,
        code,
      });
      if (v.error) throw v.error;
      toast.success("2FA ativado com sucesso");
      setCode("");
      await refresh();
    } catch (e) {
      const msg = (e as Error).message || "Verificação falhou";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Disable ─────────────────────────────────────────────────────────────
  const disable = async () => {
    if (state.kind !== "enabled") return;
    const ok = window.confirm(
      "Desligar 2FA reduz a segurança da sua conta. Tem certeza?",
    );
    if (!ok) return;
    setSubmitting(true);
    const sb = createClient();
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId: state.factorId });
      if (error) throw error;
      toast.success("2FA desativado");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Falha ao desativar 2FA");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-3xl font-bold">Segurança</h1>
        </div>
        <p className="text-muted-foreground">
          Proteja sua conta com autenticação em dois fatores (2FA).
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {state.kind === "enabled" ? (
                <ShieldCheck className="h-6 w-6 text-green-500" />
              ) : (
                <Shield className="h-6 w-6 text-muted-foreground" />
              )}
              <div>
                <CardTitle>Autenticação em dois fatores</CardTitle>
                <CardDescription>
                  Use um app como Google Authenticator, Authy ou 1Password.
                </CardDescription>
              </div>
            </div>
            {state.kind === "enabled" && (
              <Badge variant="default" className="bg-green-500/15 text-green-700 dark:text-green-400">
                Ativado
              </Badge>
            )}
            {state.kind === "disabled" && <Badge variant="outline">Desativado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          )}

          {state.kind === "disabled" && (
            <>
              <p className="text-sm text-muted-foreground">
                2FA está desligado. Quando ativar, vamos pedir um código de 6
                dígitos toda vez que você logar.
              </p>
              <Button onClick={startEnroll}>Ativar 2FA</Button>
            </>
          )}

          {state.kind === "enrolling" && (
            <>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Escaneie o QR code no seu app autenticador, ou copie a chave
                  manualmente. Depois digite o código de 6 dígitos.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-start bg-muted/30 p-4 rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="QR code"
                    className="w-44 h-44 bg-white p-2 rounded"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(state.otpauthUri)}`}
                  />
                  <div className="space-y-2 min-w-0 flex-1">
                    <div>
                      <Label className="text-xs uppercase text-muted-foreground">Chave manual</Label>
                      <code className="block mt-1 text-xs font-mono bg-background p-2 rounded select-all break-all">
                        {state.secret}
                      </code>
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="code">Código de 6 dígitos</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && void verify()}
                    placeholder="000000"
                    className="text-center text-2xl tracking-widest font-mono mt-1"
                  />
                </div>
                {errorMsg && (
                  <p className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">
                    {errorMsg}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button onClick={verify} disabled={submitting || code.length !== 6}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verificando…
                      </>
                    ) : (
                      "Confirmar e ativar"
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => void refresh()} disabled={submitting}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </>
          )}

          {state.kind === "enabled" && (
            <>
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Factor:</span>{" "}
                  <span className="font-medium">{state.friendlyName ?? "TOTP"}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Ativado em:</span>{" "}
                  <span className="font-medium">
                    {new Date(state.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </p>
              </div>
              <Button variant="destructive" onClick={disable} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Desativando…
                  </>
                ) : (
                  "Desativar 2FA"
                )}
              </Button>
            </>
          )}

          {state.kind === "error" && (
            <>
              <p className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">
                Erro: {state.message}
              </p>
              <Button onClick={() => void refresh()}>Tentar de novo</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
