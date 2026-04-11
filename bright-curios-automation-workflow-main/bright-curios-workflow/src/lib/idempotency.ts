import { prisma } from "./prisma";

const db = prisma as any; // Prisma client will be regenerated after running migrations

export interface IdempotencyRecord {
  id: string;
  token: string;
  purpose?: string | null;
  request_hash?: string | null;
  response?: any;
  consumed: boolean;
  created_at: Date;
  expires_at?: Date | null;
}

export async function getKeyByToken(token: string) {
  return db.idempotencyKey.findUnique({ where: { token } });
}

export async function createKey(
  token: string,
  opts?: { purpose?: string; request_hash?: string; expiresAt?: Date },
) {
  try {
    const rec = await db.idempotencyKey.create({
      data: {
        token,
        purpose: opts?.purpose,
        request_hash: opts?.request_hash,
        expires_at: opts?.expiresAt ?? null,
      },
    });
    return rec;
  } catch (error) {
    // If token already exists, return existing
    return db.idempotencyKey.findUnique({ where: { token } });
  }
}

export async function consumeKey(token: string, response: any) {
  return db.idempotencyKey.update({
    where: { token },
    data: { consumed: true, response },
  });
}

export async function cleanupExpired() {
  const now = new Date();
  return db.idempotencyKey.deleteMany({
    where: { expires_at: { lt: now } },
  });
}
