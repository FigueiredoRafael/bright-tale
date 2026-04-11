import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

async function sync() {
  const prodUrl = process.env.PROD_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;
  const backupDir = "./backups/sync";

  if (!prodUrl || !devUrl) {
    console.error("❌ PROD_DATABASE_URL and DATABASE_URL environment variables are required.");
    process.exit(1);
  }

  if (devUrl.includes("production") || devUrl.includes("rds.amazonaws.com")) {
    console.error("❌ Safety error: DATABASE_URL seems to be a production database. Sync aborted.");
    process.exit(1);
  }

  console.log("🚀 Starting Production -> Dev Sync...");
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpFile = path.join(backupDir, `prod_sync_${timestamp}.dump`);

  try {
    console.log("📥 Dumping Production Database...");
    execSync(`pg_dump "${prodUrl}" -F c -f "${dumpFile}"`);
    
    console.log("📤 Restoring to Local Development Database...");
    execSync(`pg_restore -d "${devUrl}" --clean --no-owner --no-privileges "${dumpFile}"`);
    
    const pool = new Pool({ connectionString: devUrl });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    console.log("🔒 Sanitizing Sensitive Data...");
    // @ts-ignore
    await prisma.aIProviderConfig.updateMany({
      data: { api_key: "MASKED_DURING_SYNC" }
    });
    
    // @ts-ignore
    await prisma.wordPressConfig.updateMany({
      data: { password: "MASKED_DURING_SYNC" }
    });

    console.log("✅ Sync and Sanitization completed successfully!");
    await prisma.$disconnect();
    await pool.end();
  } catch (error) {
    console.error("❌ Sync failed:", error);
    process.exit(1);
  }
}

sync();
