-- 0001_identity_foundation
--
-- Reviewed baseline migration for the Phase 1 identity foundation (Plan 01-04).
-- Generated from prisma/schema.prisma with:
--   prisma migrate diff --from-empty --to-schema=prisma/schema.prisma --script
-- and reviewed by hand. No credentials, Clerk subjects or profile values are
-- present; the only identifier persisted for a deleted subject is an opaque
-- HMAC digest written by the application, never by this migration.
--
-- Prisma generates no down migration. This migration is immutable once applied
-- to a shared database; corrections are forward-only via a new migration.
-- Revert applicability is proven by apply -> drop/reset -> re-apply on a
-- disposable database in apps/api/scripts/test-migrations.sh.
--
-- Lifecycle states here implement the owner's 2026-11-17 resolutions: staged
-- closure and a keyed permanent tombstone. Store/order/user foreign keys are
-- ON DELETE RESTRICT so retained business records cannot be cascade-deleted.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserLifecycleStatus" AS ENUM ('ACTIVE', 'CLOSURE_REQUESTED', 'CLOSURE_ACCEPTED', 'ANONYMIZED');

-- CreateEnum
CREATE TYPE "StoreLifecycleStatus" AS ENUM ('ACTIVE', 'CLOSURE_REQUESTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'PAYMENT_FAILED');

-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('CUSTOMER', 'MERCHANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "TombstoneRevocationOutcome" AS ENUM ('PENDING', 'REVOKED', 'FAILED');

-- CreateEnum
CREATE TYPE "LifecycleEventType" AS ENUM ('CAPABILITY_GRANTED', 'CAPABILITY_REVOKED', 'CLOSURE_REQUESTED', 'CLOSURE_ACCEPTED', 'OBLIGATIONS_RESOLVED', 'PROFILE_ANONYMIZED', 'TOMBSTONE_WRITTEN', 'PROVIDER_REVOCATION_ATTEMPTED', 'PROVIDER_REVOCATION_SUCCEEDED', 'PROVIDER_REVOCATION_FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_subject" VARCHAR(255),
    "email" VARCHAR(320),
    "display_name" VARCHAR(150),
    "lifecycle_status" "UserLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_capabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "capability" "Capability" NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "StoreLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buyer_user_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_tombstones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_digest" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "provider_revocation_outcome" "TombstoneRevocationOutcome" NOT NULL DEFAULT 'PENDING',
    "provider_revocation_attempts" INTEGER NOT NULL DEFAULT 0,
    "provider_revocation_last_error_code" VARCHAR(128),
    "provider_revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_tombstones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "event_type" "LifecycleEventType" NOT NULL,
    "outcome" VARCHAR(64),
    "detail" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_url" VARCHAR(2048) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_subject_key" ON "users"("clerk_subject");

-- CreateIndex
CREATE UNIQUE INDEX "user_capabilities_user_id_capability_key" ON "user_capabilities"("user_id", "capability");

-- CreateIndex
CREATE INDEX "stores_owner_user_id_idx" ON "stores"("owner_user_id");

-- CreateIndex
CREATE INDEX "orders_buyer_user_id_idx" ON "orders"("buyer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_tombstones_subject_digest_key" ON "identity_tombstones"("subject_digest");

-- CreateIndex
CREATE INDEX "lifecycle_events_user_id_idx" ON "lifecycle_events"("user_id");

-- AddForeignKey
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit events are append-only. Application discipline alone cannot protect
-- anonymization/provider-outcome history, so the database rejects any UPDATE
-- or DELETE. This trigger is a reviewed addition on top of the diff output.
CREATE FUNCTION reject_lifecycle_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lifecycle_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lifecycle_events_append_only
  BEFORE UPDATE OR DELETE ON "lifecycle_events"
  FOR EACH ROW EXECUTE FUNCTION reject_lifecycle_event_mutation();
