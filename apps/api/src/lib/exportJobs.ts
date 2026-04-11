import { createServiceClient } from '@/lib/supabase';
import { randomUUID } from "crypto";

type JobStatus = "pending" | "done" | "failed";

interface ExportJob {
  id: string;
  projectIds: string[];
  status: JobStatus;
  createdAt: number;
  payload?: any; // produced export content when done
}

const jobs = new Map<string, ExportJob>();

export async function createExportJob(projectIds: string[]) {
  const id = randomUUID();
  const job: ExportJob = {
    id,
    projectIds,
    status: "pending",
    createdAt: Date.now(),
  };

  jobs.set(id, job);

  // Synchronously generate JSON export for simplicity (can be made async later)
  try {
    const sb = createServiceClient();
    const { data: projects, error } = await sb
      .from('projects')
      .select('*')
      .in('id', projectIds);

    if (error) throw error;

    job.payload = {
      projects: (projects ?? []).map((p: any) => ({
        id: p.id,
        title: p.title,
        current_stage: p.current_stage,
        status: p.status,
        winner: p.winner,
        created_at: p.created_at,
        research_id: p.research_id,
      })),
    };
    job.status = "done";
    jobs.set(id, job);
  } catch (err) {
    job.status = "failed";
    jobs.set(id, job);
  }

  return id;
}

export function getExportJob(id: string) {
  return jobs.get(id) ?? null;
}

export function getExportPayload(id: string) {
  const j = jobs.get(id);
  if (!j || j.status !== "done") return null;
  return j.payload;
}
