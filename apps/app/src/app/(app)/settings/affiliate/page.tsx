'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Gift, Copy, Check, ArrowLeft, Users, DollarSign, MousePointer, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface AffiliateProgram {
  id: string;
  code: string;
  commission_pct: number;
  total_referrals: number;
  total_revenue_cents: number;
  total_paid_cents: number;
  created_at: string;
}

interface Referral {
  id: string;
  status: string;
  first_touch_at: string;
  conversion_at: string | null;
  subscription_amount_cents: number | null;
  commission_cents: number | null;
}

export default function AffiliatePage() {
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [plan, setPlan] = useState('free');
  const [program, setProgram] = useState<AffiliateProgram | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchProgram = useCallback(async () => {
    try {
      const res = await fetch('/api/affiliate/program');
      const json = await res.json();
      if (json.data) {
        setEligible(json.data.eligible);
        setPlan(json.data.plan);
        setProgram(json.data.program);
      }
    } catch {
      toast.error('Falha ao carregar programa');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReferrals = useCallback(async () => {
    const res = await fetch('/api/affiliate/referrals');
    const json = await res.json();
    if (json.data) setReferrals(json.data.referrals ?? []);
  }, []);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  useEffect(() => {
    if (program) fetchReferrals();
  }, [program, fetchReferrals]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/affiliate/program', { method: 'POST' });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
      } else {
        setProgram(json.data.program);
        toast.success('Programa de afiliados criado!');
      }
    } catch {
      toast.error('Falha ao criar programa');
    } finally {
      setCreating(false);
    }
  }

  function getReferralLink() {
    if (!program) return '';
    const base = typeof window !== 'undefined' ? window.location.origin.replace('app.', '') : 'https://brighttale.io';
    return `${base}?ref=${program.code}`;
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(getReferralLink());
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  }

  function formatCurrency(cents: number) {
    return `R$ ${(cents / 100).toFixed(2)}`;
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings"><ArrowLeft className="h-4 w-4 mr-1" /> Configurações</Link>
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6" /> Programa de Afiliados
        </h1>
      </div>

      {!eligible ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Gift className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">Plano {plan} não inclui afiliados</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Faça upgrade para Starter ou superior para acessar o programa de afiliados.
              </p>
            </div>
            <Button asChild>
              <Link href="/settings/billing">Ver planos</Link>
            </Button>
          </CardContent>
        </Card>
      ) : !program ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Gift className="h-12 w-12 mx-auto text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Ganhe 20% de comissão por indicação</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Compartilhe seu link e receba comissão sobre cada assinatura que seus indicados fizerem.
              </p>
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Criando...' : 'Ativar programa'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Seu link de referral</CardTitle>
              <CardDescription>Compartilhe este link para receber {program.commission_pct}% de comissão</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
                  {getReferralLink()}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">Código: {program.code}</Badge>
                <Badge variant="secondary">{program.commission_pct}% comissão</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{program.total_referrals}</p>
                <p className="text-xs text-muted-foreground">Indicações</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <MousePointer className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{referrals.filter((r) => r.conversion_at).length}</p>
                <p className="text-xs text-muted-foreground">Conversões</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <TrendingUp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{formatCurrency(program.total_revenue_cents)}</p>
                <p className="text-xs text-muted-foreground">Receita gerada</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{formatCurrency(program.total_paid_cents)}</p>
                <p className="text-xs text-muted-foreground">Pago</p>
              </CardContent>
            </Card>
          </div>

          {referrals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Referrals recentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {referrals.map((ref) => (
                    <div key={ref.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={ref.conversion_at ? 'default' : 'secondary'}
                        >
                          {ref.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(ref.first_touch_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="text-sm font-medium">
                        {ref.commission_cents ? formatCurrency(ref.commission_cents) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
