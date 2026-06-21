/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[room_id,user_id]` on the table `room_players` will be added. If there are existing duplicate values, this will fail.
  - Made the column `room_id` on table `room_players` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user_id` on table `room_players` required. This step will fail if there are existing NULL values in that column.
  - Made the column `joined_at` on table `room_players` required. This step will fail if there are existing NULL values in that column.
  - Made the column `is_private` on table `rooms` required. This step will fail if there are existing NULL values in that column.
  - Made the column `max_players` on table `rooms` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `rooms` required. This step will fail if there are existing NULL values in that column.
  - Made the column `is_guest` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "room_players" DROP CONSTRAINT "room_players_room_id_fkey";

-- DropForeignKey
ALTER TABLE "room_players" DROP CONSTRAINT "room_players_user_id_fkey";

-- AlterTable
ALTER TABLE "room_players" ALTER COLUMN "room_id" SET NOT NULL,
ALTER COLUMN "user_id" SET NOT NULL,
ALTER COLUMN "joined_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "rooms" ALTER COLUMN "is_private" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'waiting',
ALTER COLUMN "max_players" SET NOT NULL,
ALTER COLUMN "created_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "is_guest" SET NOT NULL,
ALTER COLUMN "created_at" SET NOT NULL;

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "favorite_team" VARCHAR(100),
    "favorite_country" VARCHAR(100),
    "favorite_player" VARCHAR(100),
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "matches_won" INTEGER NOT NULL DEFAULT 0,
    "tournaments_won" INTEGER NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "room_id" UUID,
    "mode" VARCHAR(20) NOT NULL DEFAULT 'multiplayer',
    "ai_difficulty" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "letter" VARCHAR(1) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'answering',
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_advanced" BOOLEAN NOT NULL DEFAULT false,
    "season_id" UUID,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "room_player_id" UUID,
    "category_id" UUID NOT NULL,
    "answer_text" VARCHAR(150),
    "is_valid" BOOLEAN,
    "points" INTEGER NOT NULL DEFAULT 0,
    "validated_by" VARCHAR(20) NOT NULL DEFAULT 'pending',

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "room_player_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "approve" BOOLEAN NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_match_id_round_number_key" ON "rounds"("match_id", "round_number");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "answers_round_id_room_player_id_category_id_key" ON "answers"("round_id", "room_player_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_answer_id_user_id_key" ON "votes"("answer_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_players_room_id_user_id_key" ON "room_players"("room_id", "user_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_room_player_id_fkey" FOREIGN KEY ("room_player_id") REFERENCES "room_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_room_player_id_fkey" FOREIGN KEY ("room_player_id") REFERENCES "room_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
