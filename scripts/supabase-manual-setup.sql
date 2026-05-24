-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Use when `npm run db:migrate` fails with P1001 on port 5432

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED');

-- CreateTable
CREATE TABLE IF NOT EXISTS "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "stock_levels" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "reservedUnits" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reservations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "idempotency_records" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT,
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_code_key" ON "warehouses"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_levels_productId_warehouseId_key" ON "stock_levels"("productId", "warehouseId");
CREATE UNIQUE INDEX IF NOT EXISTS "reservations_idempotencyKey_key" ON "reservations"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "reservations_status_expiresAt_idx" ON "reservations"("status", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_key_scope_key" ON "idempotency_records"("key", "scope");

ALTER TABLE "stock_levels" DROP CONSTRAINT IF EXISTS "stock_levels_productId_fkey";
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_levels" DROP CONSTRAINT IF EXISTS "stock_levels_warehouseId_fkey";
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "reservations_productId_fkey";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "reservations_warehouseId_fkey";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
