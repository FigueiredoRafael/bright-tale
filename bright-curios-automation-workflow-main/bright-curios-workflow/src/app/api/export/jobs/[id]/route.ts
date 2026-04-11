import { NextRequest } from "next/server";
import { getExportJob } from "@/lib/exportJobs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getExportJob(id);
  if (!job)
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

  return new Response(JSON.stringify({ job_id: job.id, status: job.status }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
