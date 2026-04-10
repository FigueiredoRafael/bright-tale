// TODO-supabase: import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/export/jobs/route";
import { GET } from "@/app/api/export/jobs/[id]/route";
import { GET as downloadGET } from "@/app/api/export/jobs/[id]/download/route";

describe("Export job API", () => {
  it("creates a job and allows download", async () => {
    const p = await prisma.project.create({
      data: {
        title: "Job Export Test",
        current_stage: "production",
        status: "active",
      },
    });

    const req = new Request("http://localhost/api/export/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [p.id] }),
    });

    // @ts-ignore
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("job_id");
    const jobId = json.job_id as string;

    // check status
    // @ts-ignore
    const statusRes = await GET(new Request("http://localhost"), {
      params: { id: jobId },
    } as any);
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.status).toBe("done");

    // download
    // @ts-ignore
    const dlRes = await downloadGET(new Request("http://localhost"), {
      params: { id: jobId },
    } as any);
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("Content-Disposition")).toContain(jobId);

    const dlJson = await dlRes.json();
    expect(dlJson).toHaveProperty("projects");
    expect(dlJson.projects.length).toBe(1);

    // cleanup
    await prisma.project.delete({ where: { id: p.id } });
  });
});
