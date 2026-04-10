import { NextRequest } from "next/server";
import { z } from "zod";
import { createExportJob } from "@/lib/exportJobs";
import { validateBody } from "@/lib/api/validation";

export async function POST(req: NextRequest) {
  try {
    const bodySchema = z.object({
      project_ids: z.array(z.string().cuid()).min(1),
    });
    const data = await validateBody(req, bodySchema);

    const id = await createExportJob(data.project_ids);

    return new Response(JSON.stringify({ job_id: id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Bad request" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
}
