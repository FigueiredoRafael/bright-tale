"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveChannel } from "@/hooks/use-active-channel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Radio, Lightbulb, FileText, PenLine, Video, Zap, Mic,
  Sparkles, Plus, Globe, ChevronRight, ArrowRight,
} from "lucide-react";

function QuickCreateButton({ href, icon: Icon, label, description }: {
  href: string; icon: React.ElementType; label: string; description: string;
}) {
  return (
    <Link href={href} className="group flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/[0.02] transition-all">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

function StatCard({ label, value, icon: Icon }: {
  label: string; value: number | string; icon: React.ElementType;
}) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-5 flex justify-between items-start">
      <div>
        <div className="text-[11px] font-medium text-muted-foreground mb-2">{label}</div>
        <div className="text-[28px] font-extrabold font-display leading-none tracking-tight">
          {value}
        </div>
      </div>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { channels, activeChannel, loading } = useActiveChannel();

  // Smart redirect: if no channels, push to onboarding
  useEffect(() => {
    if (!loading && channels.length === 0) {
      router.push("/onboarding");
    }
  }, [loading, channels.length, router]);

  if (loading) {
    return (
      <>
        <div className="space-y-4">
          <div className="h-10 w-64 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
      </>
    );
  }

  // No channels → redirecting to onboarding (brief flicker)
  if (channels.length === 0) {
    return (
      <>
        <Card className="max-w-lg mx-auto mt-20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Você ainda não decidiu seu canal</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">
              Vamos configurar seu primeiro canal de conteúdo em menos de 2 minutos.
            </p>
            <Button onClick={() => router.push("/onboarding")}>
              <Plus className="h-4 w-4 mr-2" /> Começar
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  // Has channels — show dashboard
  return (
    <>
      <div className="space-y-5 animate-[fadeInUp_0.4s_ease_both]">
        {/* Header with active channel */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {activeChannel ? `Hello, ${activeChannel.name}` : "Dashboard"}
            </h1>
            {activeChannel && (
              <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                <Globe className="h-3.5 w-3.5" />
                {activeChannel.niche ?? activeChannel.channel_type} &middot; {activeChannel.language}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <StatCard label="Content Channels" value={channels.length} icon={Radio} />
          <StatCard label="Ideas" value="—" icon={Lightbulb} />
          <StatCard label="Drafts" value="—" icon={PenLine} />
          <StatCard label="Published" value="—" icon={ChevronRight} />
        </div>

        {/* Quick Create — pa pum */}
        {activeChannel && (
          <div className="bg-card border border-border rounded-[14px] p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-semibold">Criar conteúdo</h2>
                <p className="text-xs text-muted-foreground">Pa pum — escolha o formato e a IA gera</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <QuickCreateButton
                href={`/channels/${activeChannel.id}/create`}
                icon={Sparkles}
                label="Multi-format"
                description="Pipeline completo: pesquisa + múltiplos outputs"
              />
              <QuickCreateButton
                href={`/channels/${activeChannel.id}/create?format=blog`}
                icon={PenLine}
                label="Blog Post"
                description="Post SEO com imagens"
              />
              <QuickCreateButton
                href={`/channels/${activeChannel.id}/create?format=video`}
                icon={Video}
                label="Video Script"
                description="Roteiro completo com B-roll"
              />
              <QuickCreateButton
                href={`/channels/${activeChannel.id}/create?format=shorts`}
                icon={Zap}
                label="Shorts"
                description="Script otimizado para verticais"
              />
              <QuickCreateButton
                href={`/channels/${activeChannel.id}/create?format=podcast`}
                icon={Mic}
                label="Podcast"
                description="Roteiro + talking points"
              />
              <QuickCreateButton
                href="/ideas"
                icon={Lightbulb}
                label="Ideas Library"
                description="Escolher de ideias salvas"
              />
            </div>
          </div>
        )}

        {/* Channels list if more than 1 */}
        {channels.length > 1 && (
          <div className="bg-card border border-border rounded-[14px] p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold">Seus Canais</h2>
              <Link href="/channels" className="text-primary text-xs font-medium hover:text-[#4ADE80]">
                Ver todos →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {channels.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  href={`/channels/${c.id}`}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all ${
                    c.id === activeChannel?.id
                      ? "border-primary/40 bg-primary/[0.03]"
                      : "border-border hover:border-primary/30 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Radio className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {c.niche ?? c.channel_type}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
