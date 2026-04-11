"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface UsersFiltersProps {
  totalResults: number;
}

export function UsersFilters({ totalResults }: UsersFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const pushParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "all") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      params.delete("page");
      router.push(`/users?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = searchParams.get("search") ?? "";
      if (search !== current) {
        pushParams({ search });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, searchParams, pushParams]);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="relative flex-1 w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select
        value={searchParams.get("premium") ?? "all"}
        onValueChange={(v) => pushParams({ premium: v })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Premium" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="true">Premium</SelectItem>
          <SelectItem value="false">Free</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("active") ?? "all"}
        onValueChange={(v) => pushParams({ active: v })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="true">Ativo</SelectItem>
          <SelectItem value="false">Inativo</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("role") ?? "all"}
        onValueChange={(v) => pushParams({ role: v })}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>

      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {totalResults} resultado{totalResults !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
