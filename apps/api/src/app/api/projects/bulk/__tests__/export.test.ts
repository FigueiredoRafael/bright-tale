import { POST } from "@/app/api/projects/bulk/route";
// TODO-supabase: import { prisma } from "@/lib/prisma";

// TODO-test: skip until Supabase integration tests are set up
describe.skip("POST /api/projects/bulk (export)", () => {
  it("returns JSON attachment with selected projects", async () => {
    // create two projects
    const p1 = await prisma.project.create({
      data: {
        title: "Export Test 1",
        current_stage: "production",
        status: "active",
      },
    });
    const p2 = await prisma.project.create({
      data: {
        title: "Export Test 2",
        current_stage: "production",
        status: "active",
      },
    });

    const payload = { operation: "export", project_ids: [p1.id, p2.id] };

    const req = new Request("http://localhost/api/projects/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // @ts-ignore
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toBe("application/json");
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toContain("projects-export.json");

    const json = await res.json();
    expect(json).toHaveProperty("projects");
    expect(Array.isArray(json.projects)).toBe(true);
    expect(json.projects.length).toBe(2);
    const ids = json.projects.map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining([p1.id, p2.id]));

    // cleanup
    await prisma.project.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
  });
});
