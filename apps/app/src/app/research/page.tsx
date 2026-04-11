"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ResearchCard } from "@/components/research";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Search,
    X,
    Grid3x3,
    List,
    Plus,
    AlertCircle,
    RefreshCcw
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetchResearchList, type Research } from "@/lib/api/research";

const THEMES = [
    "All",
    "Psychology",
    "Productivity",
    "Health",
    "Science",
    "Technology",
    "Business",
    "Lifestyle",
];

const SORT_OPTIONS = [
    { value: "created_at", label: "Date (Newest)" },
    { value: "projects_count", label: "Projects Count" },
    { value: "winners_count", label: "Winners Count" },
];

function ResearchLibraryContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // State
    const [research, setResearch] = useState<Research[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Pagination
    const [page, setPage] = useState<number>(1);
    const [limit] = useState<number>(12);
    const [total, setTotal] = useState<number | null>(null);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);

    // URL-synced state
    const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
    const [theme, setTheme] = useState(searchParams.get("theme") || "All");
    const [sort, setSort] = useState(searchParams.get("sort") || "created_at");

    // View mode (localStorage-synced)
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

    // Load view mode from localStorage
    useEffect(() => {
        const savedViewMode = localStorage.getItem("research-view-mode");
        if (savedViewMode === "grid" || savedViewMode === "list") {
            setViewMode(savedViewMode);
        }
    }, []);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            updateURL();
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    // Update URL when filters change
    useEffect(() => {
        updateURL();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme, sort]);

    // Fetch research when URL changes
    useEffect(() => {
        setPage(1);
        fetchResearch(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const updateURL = () => {
        const params = new URLSearchParams();

        if (searchQuery) params.set("search", searchQuery);
        if (theme !== "All") params.set("theme", theme);
        if (sort !== "created_at") params.set("sort", sort);

        const queryString = params.toString();
        const newURL = queryString ? `/research?${queryString}` : "/research";

        router.push(newURL, { scroll: false });
    };

    const fetchResearch = async (pageArg = 1) => {
        if (pageArg === 1) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        setError(null);

        try {
            const data = await fetchResearchList({
                search: searchQuery || undefined,
                theme: theme !== "All" ? theme : undefined,
                sort,
                order: "desc",
                page: pageArg,
                limit,
            });

            if (pageArg === 1) {
                setResearch(data.research || []);
            } else {
                setResearch((prev) => [...prev, ...(data.research || [])]);
            }

            setTotal(data.pagination?.total ?? data.research.length);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load research");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleClearSearch = () => {
        setSearchQuery("");
    };

    const handleViewModeChange = (mode: "grid" | "list") => {
        setViewMode(mode);
        localStorage.setItem("research-view-mode", mode);
    };

    const handleRetry = () => {
        fetchResearch();
    };

    return (
        <div className="container mx-auto py-8 px-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-4xl font-bold mb-2">Research Library</h1>
                    <p className="text-muted-foreground">
                        Manage your research content and track project performance
                    </p>
                </div>
                <Button onClick={() => router.push("/research/new")}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Research
                </Button>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search research by title or content..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-10"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                            onClick={handleClearSearch}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Theme Filter */}
                <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Theme" />
                    </SelectTrigger>
                    <SelectContent>
                        {THEMES.map((t) => (
                            <SelectItem key={t} value={t}>
                                {t}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Sort */}
                <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                        {SORT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* View Toggle */}
                <div className="flex gap-1 border rounded-lg p-1">
                    <Button
                        variant={viewMode === "grid" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => handleViewModeChange("grid")}
                        className="h-8"
                    >
                        <Grid3x3 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => handleViewModeChange("list")}
                        className="h-8"
                    >
                        <List className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                        <span>{error}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRetry}
                            className="ml-4"
                        >
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* Loading State */}
            {loading && (
                <div
                    className={
                        viewMode === "grid"
                            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                            : "flex flex-col gap-4"
                    }
                >
                    {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} className="h-[250px] w-full" />
                    ))}
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && research.length === 0 && (
                <div className="text-center py-16">
                    <div className="text-6xl mb-4">📚</div>
                    <h3 className="text-heading-md mb-2">No research found</h3>
                    <p className="text-muted-foreground mb-6">
                        {searchQuery || theme !== "All"
                            ? "Try adjusting your search or filters"
                            : "Get started by creating your first research entry"}
                    </p>
                    {(searchQuery || theme !== "All") && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSearchQuery("");
                                setTheme("All");
                            }}
                        >
                            Clear Filters
                        </Button>
                    )}
                </div>
            )}

            {/* Research Grid/List */}
            {!loading && !error && research.length > 0 && (
                <div
                    className={
                        viewMode === "grid"
                            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                            : "flex flex-col gap-4"
                    }
                >
                    {research.map((item) => (
                        <ResearchCard
                            key={item.id}
                            id={item.id}
                            title={item.title}
                            theme={item.theme}
                            winners_count={item.winners_count}
                            projects_count={item.projects_count}
                            updated_at={item.updated_at}
                            className={viewMode === "list" ? "w-full" : ""}
                        />
                    ))}
                </div>
            )}

            {/* Results Count */}
            {!loading && !error && research.length > 0 && (
                <div className="mt-6 text-center text-sm text-muted-foreground">
                    Showing {research.length} of {total ?? research.length}
                </div>
            )}

            {/* Load more */}
            {!loading && !error && research.length > 0 && (total === null || research.length < total) && (
                <div className="mt-6 text-center">
                    <Button
                        onClick={() => {
                            const next = page + 1;
                            setPage(next);
                            fetchResearch(next);
                        }}
                        disabled={loadingMore}
                    >
                        {loadingMore ? "Loading..." : "Load more"}
                    </Button>
                </div>
            )}
        </div>
    );
}

export default function ResearchLibraryPage() {
    return (
        <Suspense>
            <ResearchLibraryContent />
        </Suspense>
    );
}
