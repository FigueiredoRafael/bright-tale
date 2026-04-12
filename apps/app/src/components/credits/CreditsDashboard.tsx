'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';

interface CreditBalance {
  creditsTotal: number;
  creditsUsed: number;
  creditsAddon: number;
  creditsResetAt: string | null;
  available: number;
}

interface CategoryUsage {
  categories: Record<string, number>;
}

function ProgressBar({ used, total, addon }: { used: number; total: number; addon: number }) {
  const planUsed = Math.min(used, total);
  const percentage = total > 0 ? (planUsed / total) * 100 : 0;

  let barColor = 'bg-green-500';
  if (percentage >= 95) barColor = 'bg-red-500';
  else if (percentage >= 80) barColor = 'bg-amber-500';

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          {planUsed.toLocaleString()} / {total.toLocaleString()} credits used
        </span>
        <span className="font-medium">{Math.round(percentage)}%</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {addon > 0 && (
        <p className="text-xs text-muted-foreground">
          + {addon.toLocaleString()} addon credits available
        </p>
      )}
    </div>
  );
}

function CategoryBreakdown({ categories }: { categories: Record<string, number> }) {
  const total = Object.values(categories).reduce((sum, v) => sum + v, 0);
  if (total === 0) return null;

  const CATEGORY_COLORS: Record<string, string> = {
    text: 'bg-blue-500',
    voice: 'bg-purple-500',
    image: 'bg-amber-500',
    video: 'bg-red-500',
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Usage by category</h4>
      <div className="space-y-1.5">
        {Object.entries(categories)
          .sort(([, a], [, b]) => b - a)
          .map(([category, cost]) => (
            <div key={category} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${CATEGORY_COLORS[category] ?? 'bg-gray-500'}`} />
                <span className="capitalize">{category}</span>
              </div>
              <span className="text-muted-foreground">{cost.toLocaleString()}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export function CreditsDashboard() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [categories, setCategories] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [balanceRes, categoryRes] = await Promise.all([
        fetch('/api/credits/balance'),
        fetch('/api/credits/usage/by-category'),
      ]);
      const balanceJson = await balanceRes.json();
      const categoryJson = await categoryRes.json();

      if (balanceJson.data) setBalance(balanceJson.data);
      if (categoryJson.data) setCategories((categoryJson.data as CategoryUsage).categories);
    } catch {
      toast.error('Failed to load credit data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!balance) return null;

  const percentage = balance.creditsTotal > 0
    ? (balance.creditsUsed / balance.creditsTotal) * 100
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Credits
          </CardTitle>
          {percentage >= 80 && (
            <Badge variant={percentage >= 95 ? 'destructive' : 'secondary'}>
              {percentage >= 95 ? 'Almost depleted' : 'Running low'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProgressBar
          used={balance.creditsUsed}
          total={balance.creditsTotal}
          addon={balance.creditsAddon}
        />

        {balance.creditsResetAt && (
          <p className="text-xs text-muted-foreground">
            Resets {new Date(balance.creditsResetAt).toLocaleDateString()}
          </p>
        )}

        <CategoryBreakdown categories={categories} />
      </CardContent>
    </Card>
  );
}
