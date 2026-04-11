"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, Crown, Shield, UserPlus, UserX } from "lucide-react";
import type { UsersKpis, UsersSparklines } from "@brighttale/shared/types/users";

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="ml-auto">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  sparkline?: number[];
  sparkColor?: string;
}

function KpiCard({ icon, label, value, sparkline, sparkColor }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2">{icon}</div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value.toLocaleString("pt-BR")}</p>
            </div>
          </div>
          {sparkline && sparkColor && (
            <MiniSparkline data={sparkline} color={sparkColor} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface UsersKpiSectionProps {
  kpis: UsersKpis;
  sparklines: UsersSparklines;
}

export function UsersKpiSection({ kpis, sparklines }: UsersKpiSectionProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <KpiCard
        icon={<Users className="h-4 w-4 text-blue-500" />}
        label="Total Usuarios"
        value={kpis.totalUsers}
        sparkline={sparklines.total}
        sparkColor="#3b82f6"
      />
      <KpiCard
        icon={<UserCheck className="h-4 w-4 text-green-500" />}
        label="Ativos"
        value={kpis.activeUsers}
      />
      <KpiCard
        icon={<Crown className="h-4 w-4 text-amber-500" />}
        label="Premium"
        value={kpis.premiumCount}
        sparkline={sparklines.premium}
        sparkColor="#f59e0b"
      />
      <KpiCard
        icon={<Shield className="h-4 w-4 text-purple-500" />}
        label="Admin"
        value={kpis.adminCount}
      />
      <KpiCard
        icon={<UserPlus className="h-4 w-4 text-cyan-500" />}
        label="Novos (mes)"
        value={kpis.newThisMonth}
        sparkline={sparklines.signups}
        sparkColor="#06b6d4"
      />
      <KpiCard
        icon={<UserX className="h-4 w-4 text-red-500" />}
        label="Inativos"
        value={kpis.inactiveUsers}
      />
    </div>
  );
}
