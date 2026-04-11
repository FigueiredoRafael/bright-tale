import { NextRequest } from "next/server";
import { getExportPayload } from "@/lib/exportJobs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = getExportPayload(id);
  if (!payload)
    return new Response(JSON.stringify({ error: "Not ready or not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

  const body = JSON.stringify(payload, null, 2);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename=projects-export-${id}.json`,
    },
  });
}
