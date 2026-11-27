-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "hospital_types" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "hospital_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hospital_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "hospital_type_id" INTEGER,
    "ownership" VARCHAR(20) NOT NULL,
    "year_established" SMALLINT,
    "state_id" INTEGER NOT NULL,
    "lga_id" INTEGER,
    "city" VARCHAR(150) NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "verification_status" VARCHAR(30) NOT NULL DEFAULT 'unclaimed',
    "accessibility_information" TEXT,
    "hospital_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgas" (
    "id" SERIAL NOT NULL,
    "state_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "lgas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "states" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospital_types_name_key" ON "hospital_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_state_name_city_unique" ON "hospitals"("state_id", "hospital_name", "city");

-- CreateIndex
CREATE UNIQUE INDEX "lgas_state_id_name_key" ON "lgas"("state_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "states_name_key" ON "states"("name");

-- AddForeignKey
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_hospital_type_id_fkey" FOREIGN KEY ("hospital_type_id") REFERENCES "hospital_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_lga_id_fkey" FOREIGN KEY ("lga_id") REFERENCES "lgas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lgas" ADD CONSTRAINT "lgas_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

