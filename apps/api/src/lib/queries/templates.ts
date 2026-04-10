// TODO-supabase: import { prisma } from "@/lib/prisma";

function deepMerge(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) return b; // child overrides arrays
  if (a && typeof a === "object" && b && typeof b === "object") {
    const res: any = { ...a };
    for (const key of Object.keys(b)) {
      res[key] = deepMerge(a[key], b[key]);
    }
    return res;
  }
  return b === undefined ? a : b;
}

export async function resolveTemplate(
  templateId: string,
  seen = new Set<string>(),
): Promise<any | null> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: { parent: true },
  });

  if (!template) return null;

  if (seen.has(templateId))
    throw new Error("Circular template parent reference detected");
  seen.add(templateId);

  const config = JSON.parse(template.config_json || "{}");

  if (template.parent) {
    const parentResolved = await resolveTemplate(template.parent.id, seen);
    return deepMerge(parentResolved || {}, config);
  }

  return config;
}
