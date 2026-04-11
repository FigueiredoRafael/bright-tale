"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCcw, Users } from "lucide-react";
import { fetchUsersList } from "@/lib/api/users";
import { UsersKpiSection } from "./components/users-kpi-section";
import { UsersFilters } from "./components/users-filters";
import { UsersTable } from "./components/users-table";
import { UsersPagination } from "./components/users-pagination";
import type {
  UserListItem,
  UsersKpis,
  UsersSparklines,
  UsersGrowthPoint,
  UsersPagination as UsersPaginationType,
} from "@brighttale/shared/types/users";

const EMPTY_KPIS: UsersKpis = {
  totalUsers: 0,
  activeUsers: 0,
  inactiveUsers: 0,
  premiumCount: 0,
  adminCount: 0,
  freeCount: 0,
  newToday: 0,
  newThisWeek: 0,
  newThisMonth: 0,
};

const EMPTY_SPARKLINES: UsersSparklines = { total: [], premium: [], signups: [] };

const EMPTY_PAGINATION: UsersPaginationType = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

function UsersPageContent() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [kpis, setKpis] = useState<UsersKpis>(EMPTY_KPIS);
  const [sparklines, setSparklines] = useState<UsersSparklines>(EMPTY_SPARKLINES);
  const [pagination, setPagination] = useState<UsersPaginationType>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsersList({
        page: Number(searchParams.get("page")) || 1,
        search: searchParams.get("search") ?? undefined,
        premium: searchParams.get("premium") ?? undefined,
        active: searchParams.get("active") ?? undefined,
        role: searchParams.get("role") ?? undefined,
        sort: searchParams.get("sort") ?? undefined,
        sortDir: searchParams.get("sortDir") ?? undefined,
      });
      setUsers(data.data);
      setKpis(data.kpis);
      setSparklines(data.sparklines);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar usuarios");
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sort = searchParams.get("sort") ?? "created_at";
  const sortDir = searchParams.get("sortDir") ?? "desc";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Usuarios</h1>
            <p className="text-sm text-muted-foreground">
              Gerenciar usuarios, roles e premium
            </p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="outline" size="sm" onClick={fetchData}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      ) : (
        !error && (
          <>
            <UsersKpiSection kpis={kpis} sparklines={sparklines} />
            <UsersFilters totalResults={pagination.totalItems} />
            <UsersTable
              users={users}
              sort={sort}
              sortDir={sortDir}
              onRefresh={fetchData}
            />
            <UsersPagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              pageSize={pagination.pageSize}
            />
          </>
        )
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense>
      <UsersPageContent />
    </Suspense>
  );
}
