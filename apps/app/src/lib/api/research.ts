/**
 * Research API Helper Functions
 *
 * Centralized API functions for research-related operations.
 * Provides consistent error handling and response parsing.
 */

// Types
export interface Research {
  id: string;
  title: string;
  theme: string | null;
  research_content: string;
  winners_count: number;
  projects_count: number;
  created_at: string;
  updated_at: string;
}

export interface ResearchWithRelations extends Research {
  sources: Source[];
  projects: Project[];
  _count: {
    sources: number;
    projects: number;
  };
}

export interface Source {
  id: string;
  research_id: string;
  url: string;
  title: string;
  author: string | null;
  date: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  title: string;
  status: string;
  current_stage: string;
  is_winner: boolean;
  created_at: string;
}

export interface ResearchListParams {
  search?: string;
  theme?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface CreateSourceData {
  url: string;
  title: string;
  author?: string;
  date?: string;
}

export interface UpdateResearchData {
  title?: string;
  theme?: string;
  research_content?: string;
}

export interface CreateProjectData {
  title: string;
  research_id: string;
  current_stage: string;
  status: string;
}

// Research List API
export async function fetchResearchList(
  params: ResearchListParams = {},
): Promise<{
  research: Research[];
  count: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const queryParams = new URLSearchParams();

  if (params.search) queryParams.set("search", params.search);
  if (params.theme && params.theme !== "All")
    queryParams.set("theme", params.theme);
  if (params.sort) queryParams.set("sort", params.sort);
  if (params.order) queryParams.set("order", params.order);
  if (params.page) queryParams.set("page", String(params.page));
  if (params.limit) queryParams.set("limit", String(params.limit));

  const url = `/api/research${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to fetch research" } }));
    throw new Error(error.error?.message || "Failed to fetch research list");
  }

  const json = await response.json();
  const responseData = json.data ?? {};
  const data = responseData.data ?? [];
  const pagination = responseData.pagination;

  return {
    research: data,
    count: pagination?.total ?? data.length,
    pagination,
  };
}

// Research Detail API
export async function fetchResearchDetail(
  id: string,
): Promise<ResearchWithRelations> {
  const response = await fetch(`/api/research/${id}`);

  if (response.status === 404) {
    throw new Error("Research not found");
  }

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to fetch research" } }));
    throw new Error(error.error?.message || "Failed to fetch research details");
  }

  const json = await response.json();
  return json.data ?? json;
}

// Update Research API
export async function updateResearch(
  id: string,
  data: UpdateResearchData,
): Promise<Research> {
  const response = await fetch(`/api/research/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to update research" } }));
    throw new Error(error.error?.message || "Failed to update research");
  }

  return response.json();
}

// Delete Research API
export async function deleteResearch(
  id: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/api/research/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to delete research" } }));
    throw new Error(error.error?.message || "Failed to delete research");
  }

  return response.json();
}

// Create Source API
export async function createSource(
  researchId: string,
  data: CreateSourceData,
): Promise<Source> {
  const response = await fetch(`/api/research/${researchId}/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to create source" } }));
    throw new Error(error.error?.message || "Failed to create source");
  }

  return response.json();
}

// Delete Source API
export async function deleteSource(
  researchId: string,
  sourceId: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `/api/research/${researchId}/sources/${sourceId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to delete source" } }));
    throw new Error(error.error?.message || "Failed to delete source");
  }

  return response.json();
}

// Update Source API (using DELETE + POST approach since no PUT endpoint exists)
export async function updateSource(
  researchId: string,
  sourceId: string,
  data: CreateSourceData,
): Promise<Source> {
  await deleteSource(researchId, sourceId);
  return createSource(researchId, data);
}

// Create Project from Research API
export async function createProjectFromResearch(
  data: CreateProjectData,
): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to create project" } }));
    throw new Error(error.error?.message || "Failed to create project");
  }

  const json = await response.json();
  return json.data;
}
