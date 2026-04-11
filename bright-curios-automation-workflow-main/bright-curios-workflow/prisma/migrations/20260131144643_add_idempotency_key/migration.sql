-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" TEXT,
    "request_hash" TEXT,
    "response" JSONB,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_token_key" ON "IdempotencyKey"("token");

-- CreateIndex
CREATE INDEX "IdempotencyKey_token_idx" ON "IdempotencyKey"("token");

-- CreateIndex
CREATE INDEX "IdempotencyKey_created_at_idx" ON "IdempotencyKey"("created_at");
