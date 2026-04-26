"use client";

/**
 * /upgrade — In-app pricing showcase + checkout entry.
 *
 * Built as part of M-019 (sales page redo). Stripe checkout (M-001) is
 * not wired yet — buttons are stubbed with a "Em breve" toast until
 * that lands. Component is fully functional UI-wise so the user can
 * preview the v0.2 pricing experience.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Sparkles, Zap, Crown } from "lucide-react";

type Cycle = "monthly" | "yearly";

interface Plan {
  id: string;
  name: string;
  tagline: string;
  monthlyUsd: number;
  tokensPerMonth: number;
  highlights: string[];
  cta: string;
  popular?: boolean;
  icon: React.ReactNode;
  accent: string;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Conheça o produto sem cartão",
    monthlyUsd: 0,
    tokensPerMonth: 500,
    highlights: [
      "500 tokens/mês (~1 blog post Standard)",
      "+2.000 tokens bônus na 1ª semana",
      "Modelos Standard (Flash / GPT-4o-mini)",
      "WordPress publish",
      "Sem cartão de crédito",
    ],
    cta: "Começar agora",
    icon: <Sparkles className="h-5 w-5" />,
    accent: "text-emerald-500",
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "Para criadores começando a escalar",
    monthlyUsd: 9,
    tokensPerMonth: 5_000,
    highlights: [
      "5.000 tokens/mês (~9 blog posts Standard)",
      "Modelos Standard + Premium (Sonnet / GPT-4o)",
      "Geração de imagem + áudio",
      "Top-up avulso disponível",
      "Suporte por chat",
    ],
    cta: "Assinar Starter",
    icon: <Zap className="h-5 w-5" />,
    accent: "text-cyan-500",
  },
  {
    id: "creator",
    name: "Creator",
    tagline: "Para quem produz conteúdo todo dia",
    monthlyUsd: 29,
    tokensPerMonth: 15_000,
    highlights: [
      "15.000 tokens/mês (~29 blog posts ou ~20 vídeos dark)",
      "Todos os modelos (Standard / Premium / Ultra)",
      "Geração de vídeo dark channel completo",
      "Voice cloning (1 vez)",
      "Uso extra opt-in (com cap)",
      "Suporte prioritário",
    ],
    cta: "Assinar Creator",
    popular: true,
    icon: <Crown className="h-5 w-5" />,
    accent: "text-amber-500",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para times e agências",
    monthlyUsd: 79,
    tokensPerMonth: 50_000,
    highlights: [
      "50.000 tokens/mês",
      "Tudo do Creator +",
      "Multi-canal (até 5 brands)",
      "Workspaces de team",
      "Roles + permissões granulares",
      "Suporte dedicado",
    ],
    cta: "Assinar Pro",
    icon: <Crown className="h-5 w-5" />,
    accent: "text-violet-500",
  },
];

const YEARLY_DISCOUNT = 0.2;

export default function UpgradePage() {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  const priceFor = (p: Plan) => {
    if (p.monthlyUsd === 0) return 0;
    return cycle === "yearly"
      ? p.monthlyUsd * 12 * (1 - YEARLY_DISCOUNT)
      : p.monthlyUsd;
  };

  const subtitleFor = (p: Plan) => {
    if (p.monthlyUsd === 0) return "grátis sempre";
    if (cycle === "yearly") {
      const monthlyEffective = p.monthlyUsd * (1 - YEARLY_DISCOUNT);
      return (
        <>
          <span className="text-xs">USD</span>
          <span className="block text-xs text-muted-foreground">
            ${monthlyEffective.toFixed(2)}/mo · cobrado anual ($
            {(p.monthlyUsd * 12 * (1 - YEARLY_DISCOUNT)).toFixed(0)}/yr · 2 meses grátis)
          </span>
        </>
      );
    }
    return (
      <>
        <span className="text-xs">USD/mês</span>
      </>
    );
  };

  const handleSelect = (planId: string) => {
    if (planId === "free") {
      toast.info("Você já está no Free. Aproveita os 2.000 tokens bônus da 1ª semana!");
      return;
    }
    toast("Checkout em breve — M-001 (Stripe wiring) está em desenvolvimento.", {
      description: `Plano ${planId} selecionado. Quando o Stripe estiver wired, o botão vai abrir Checkout direto.`,
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Escolha seu plano</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          25+ blog posts SEO, roteiros de YouTube, áudio narrado e vídeo
          completo — tudo gerado pelo pipeline de 5 agentes especializados.
          Comece grátis, escale quando precisar.
        </p>

        <div className="flex justify-center pt-2">
          <div className="inline-flex rounded-full border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                cycle === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5 ${
                cycle === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              Anual
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                −20%
              </Badge>
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={`relative flex flex-col ${
              plan.popular ? "border-primary shadow-lg" : ""
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">
                  Mais popular
                </Badge>
              </div>
            )}
            <CardHeader>
              <div className={`flex items-center gap-2 ${plan.accent}`}>
                {plan.icon}
                <CardTitle>{plan.name}</CardTitle>
              </div>
              <CardDescription>{plan.tagline}</CardDescription>
              <div className="pt-2">
                <span className="text-4xl font-bold">
                  ${priceFor(plan).toFixed(plan.monthlyUsd === 0 ? 0 : (cycle === "yearly" ? 0 : 0))}
                </span>
                <span className="text-muted-foreground ml-1">
                  {subtitleFor(plan)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2 text-sm">
                {plan.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={plan.popular ? "default" : "outline"}
                onClick={() => handleSelect(plan.id)}
              >
                {plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/20 p-6 max-w-3xl mx-auto">
        <h3 className="font-semibold text-lg mb-2">Top-up de tokens</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Esgotou os tokens do mês? Compre blocos avulsos de 1.000 tokens por
          $5 (sem mexer no plano). Ou ative o "Uso Extra" no /usage com um cap
          configurável — você decide quanto pode gastar a mais por mês.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast("Top-up checkout disponível quando M-001 (Stripe) estiver wired.")
          }
        >
          Comprar tokens avulsos
        </Button>
      </div>

      <div className="text-center text-xs text-muted-foreground space-y-1">
        <p>
          Todos os planos podem ser cancelados a qualquer momento. Refund em até
          7 dias se você não consumiu nada (24h se consumiu pouco — política de
          refund completa em <a href="/legal/refund" className="underline">/legal/refund</a>).
        </p>
        <p>
          Pix disponível no Brasil. Cartão de crédito + Apple Pay + Google Pay
          em todos os países (Stripe).
        </p>
      </div>
    </div>
  );
}
