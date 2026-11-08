-- CreateTable
CREATE TABLE "favourite_stops" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bus_stop_code" CHAR(5) NOT NULL,
    "label" VARCHAR(30),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourite_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favourite_stops_user_id_sort_order_idx" ON "favourite_stops"("user_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "favourite_stops_user_id_bus_stop_code_key" ON "favourite_stops"("user_id", "bus_stop_code");

-- AddForeignKey
ALTER TABLE "favourite_stops" ADD CONSTRAINT "favourite_stops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourite_stops" ADD CONSTRAINT "favourite_stops_bus_stop_code_fkey" FOREIGN KEY ("bus_stop_code") REFERENCES "bus_stops"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
