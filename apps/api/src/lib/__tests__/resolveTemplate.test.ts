import { resolveTemplate } from "@/lib/queries/templates";
// TODO-supabase: import { prisma } from "@/lib/prisma";

describe("resolveTemplate", () => {
  it("resolves single template", async () => {
    const t = await prisma.template.create({
      data: {
        name: "single",
        type: "theme",
        config_json: JSON.stringify({ a: 1 }),
      },
    });
    const resolved = await resolveTemplate(t.id);
    expect(resolved).toEqual({ a: 1 });
    await prisma.template.delete({ where: { id: t.id } });
  });

  it("merges parent and child config", async () => {
    const parent = await prisma.template.create({
      data: {
        name: "parent",
        type: "theme",
        config_json: JSON.stringify({ a: 1, nested: { x: 1 } }),
      },
    });
    const child = await prisma.template.create({
      data: {
        name: "child",
        type: "theme",
        config_json: JSON.stringify({ b: 2, nested: { y: 2 } }),
        parent_template_id: parent.id,
      },
    });

    const resolved = await resolveTemplate(child.id);
    expect(resolved).toEqual({ a: 1, b: 2, nested: { x: 1, y: 2 } });

    await prisma.template.delete({ where: { id: child.id } });
    await prisma.template.delete({ where: { id: parent.id } });
  });

  it("throws on circular references", async () => {
    const t1 = await prisma.template.create({
      data: { name: "t1", type: "theme", config_json: JSON.stringify({}) },
    });
    const t2 = await prisma.template.create({
      data: {
        name: "t2",
        type: "theme",
        config_json: JSON.stringify({}),
        parent_template_id: t1.id,
      },
    });
    await prisma.template.update({
      where: { id: t1.id },
      data: { parent_template_id: t2.id },
    });

    await expect(resolveTemplate(t1.id)).rejects.toThrow();

    // cleanup
    await prisma.template.delete({ where: { id: t2.id } });
    await prisma.template.delete({ where: { id: t1.id } });
  });
});
