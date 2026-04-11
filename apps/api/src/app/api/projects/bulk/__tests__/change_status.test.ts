import { POST } from "@/app/api/projects/bulk/route";
// TODO-supabase: import { prisma } from "@/lib/prisma";

// TODO-test: skip until Supabase integration tests are set up
describe.skip("POST /api/projects/bulk change_status", () => {
  it("updates status for selected projects", async () => {
    const p1 = await prisma.project.create({
      data: { title: "CS1", current_stage: "production", status: "active" },
    });
    const p2 = await prisma.project.create({
      data: { title: "CS2", current_stage: "production", status: "active" },
    });

    const req = new Request("http://localhost/api/projects/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "change_status",
        project_ids: [p1.id, p2.id],
        new_status: "archived",
      }),
    });

    // @ts-ignore
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty("affected", 2);

    const updated = await prisma.project.findMany({
      where: { id: { in: [p1.id, p2.id] } },
    });
    expect(updated.every(p => p.status === "archived")).toBe(true);

    // cleanup
    await prisma.project.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
  });
});
