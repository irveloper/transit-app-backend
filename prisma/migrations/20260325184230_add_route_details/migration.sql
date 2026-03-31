-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateTable
CREATE TABLE "operators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "website" TEXT,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_name" TEXT NOT NULL,
    "route_long_name" TEXT NOT NULL DEFAULT '',
    "route_type" TEXT NOT NULL DEFAULT 'circular',
    "color" TEXT,
    "fare_amount" DECIMAL(6,2),
    "fare_currency" TEXT NOT NULL DEFAULT 'MXN',
    "operator_id" UUID NOT NULL,
    "path" geography(LINESTRING),

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stop_name" TEXT NOT NULL,
    "location" geography(POINT),

    CONSTRAINT "stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_directions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "direction_name" TEXT NOT NULL,
    "direction_index" INTEGER NOT NULL DEFAULT 0,
    "total_stops" INTEGER NOT NULL,
    "approx_duration" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "operates_on" TEXT NOT NULL DEFAULT 'all',

    CONSTRAINT "route_directions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_direction_id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "stop_sequence" INTEGER NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" geography(POINT),
    "is_on_board" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "route_id" UUID,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_direction_id_stop_sequence_key" ON "route_stops"("route_direction_id", "stop_sequence");

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_directions" ADD CONSTRAINT "route_directions_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_direction_id_fkey" FOREIGN KEY ("route_direction_id") REFERENCES "route_directions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
