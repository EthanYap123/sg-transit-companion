-- CreateEnum
CREATE TYPE "StopSyncStatus" AS ENUM ('running', 'ok', 'failed');

-- CreateTable
CREATE TABLE "bus_stops" (
    "code" CHAR(5) NOT NULL,
    "description" TEXT NOT NULL,
    "road_name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bus_stops_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "stop_sync_runs" (
    "id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "status" "StopSyncStatus" NOT NULL DEFAULT 'running',
    "error" TEXT,

    CONSTRAINT "stop_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stop_sync_runs_started_at_idx" ON "stop_sync_runs"("started_at");
