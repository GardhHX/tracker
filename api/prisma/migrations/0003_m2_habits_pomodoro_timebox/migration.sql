-- CreateEnum
CREATE TYPE "PomodoroSessionStatus" AS ENUM ('running', 'paused', 'completed', 'cancelled');

CREATE TYPE "TimeboxKind" AS ENUM ('class', 'task', 'habit', 'focus');

CREATE TYPE "TimeboxStatus" AS ENUM ('planned', 'cancelled');

-- CreateTable
CREATE TABLE "habit" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "archived_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "habit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "habit_name_length_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "habit_archive_pair_check" CHECK (("archived_at" IS NULL) = ("archived_on" IS NULL))
);

CREATE TABLE "habit_schedule" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "habit_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "weekdays" SMALLINT[] NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "habit_schedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "habit_schedule_weekdays_check" CHECK (
      cardinality("weekdays") BETWEEN 1 AND 7
      AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
      AND cardinality("weekdays") =
        (CASE WHEN 1 = ANY("weekdays") THEN 1 ELSE 0 END +
         CASE WHEN 2 = ANY("weekdays") THEN 1 ELSE 0 END +
         CASE WHEN 3 = ANY("weekdays") THEN 1 ELSE 0 END +
         CASE WHEN 4 = ANY("weekdays") THEN 1 ELSE 0 END +
         CASE WHEN 5 = ANY("weekdays") THEN 1 ELSE 0 END +
         CASE WHEN 6 = ANY("weekdays") THEN 1 ELSE 0 END +
         CASE WHEN 7 = ANY("weekdays") THEN 1 ELSE 0 END)
    )
);

CREATE TABLE "habit_check_in" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "habit_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "habit_check_in_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pomodoro_session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cycle_day_id" UUID NOT NULL,
    "phase" "PomodoroPhase" NOT NULL,
    "status" "PomodoroSessionStatus" NOT NULL,
    "planned_seconds" INTEGER NOT NULL,
    "task_id" UUID,
    "project_id_at_start" UUID,
    "task_title_snapshot" TEXT,
    "project_name_snapshot" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pomodoro_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pomodoro_session_duration_check" CHECK (
      ("phase" = 'focus' AND "planned_seconds" = 1500) OR
      ("phase" = 'short_break' AND "planned_seconds" = 300) OR
      ("phase" = 'long_break' AND "planned_seconds" = 900)
    ),
    CONSTRAINT "pomodoro_session_shape_check" CHECK (
      ("phase" = 'focus') OR
      ("task_id" IS NULL AND "project_id_at_start" IS NULL AND "task_title_snapshot" IS NULL AND "project_name_snapshot" IS NULL)
    ),
    CONSTRAINT "pomodoro_session_state_check" CHECK (
      ("status" = 'running' AND "due_at" IS NOT NULL AND "ended_at" IS NULL) OR
      ("status" = 'paused' AND "due_at" IS NULL AND "ended_at" IS NULL) OR
      ("status" IN ('completed','cancelled') AND "due_at" IS NULL AND "ended_at" IS NOT NULL)
    )
);

CREATE TABLE "pomodoro_interval" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    CONSTRAINT "pomodoro_interval_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pomodoro_interval_order_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

CREATE TABLE "timebox_entry" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "TimeboxKind" NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "task_id" UUID,
    "habit_id" UUID,
    "status" "TimeboxStatus" NOT NULL DEFAULT 'planned',
    "cancelled_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "timebox_entry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timebox_title_length_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "timebox_time_order_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "timebox_focus_duration_check" CHECK ("kind" <> 'focus' OR "ends_at" = "starts_at" + interval '25 minutes'),
    CONSTRAINT "timebox_link_shape_check" CHECK (
      ("kind" = 'class' AND "task_id" IS NULL AND "habit_id" IS NULL) OR
      ("kind" = 'task' AND "task_id" IS NOT NULL AND "habit_id" IS NULL) OR
      ("kind" = 'habit' AND "task_id" IS NULL AND "habit_id" IS NOT NULL) OR
      ("kind" = 'focus' AND "habit_id" IS NULL)
    ),
    CONSTRAINT "timebox_cancel_pair_check" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "habit_user_id_id_key" ON "habit"("user_id", "id");
CREATE INDEX "habit_user_id_archived_on_idx" ON "habit"("user_id", "archived_on");
CREATE UNIQUE INDEX "habit_schedule_habit_id_effective_from_key" ON "habit_schedule"("habit_id", "effective_from");
CREATE UNIQUE INDEX "habit_check_in_habit_id_date_key" ON "habit_check_in"("habit_id", "date");
CREATE INDEX "habit_check_in_user_id_date_idx" ON "habit_check_in"("user_id", "date");
CREATE UNIQUE INDEX "pomodoro_session_user_id_id_key" ON "pomodoro_session"("user_id", "id");
CREATE UNIQUE INDEX "pomodoro_session_one_open_per_user" ON "pomodoro_session"("user_id") WHERE "status" IN ('running','paused');
CREATE INDEX "pomodoro_session_user_id_started_at_idx" ON "pomodoro_session"("user_id", "started_at");
CREATE INDEX "pomodoro_session_status_due_at_idx" ON "pomodoro_session"("status", "due_at");
CREATE UNIQUE INDEX "pomodoro_interval_one_open_per_session" ON "pomodoro_interval"("session_id") WHERE "ended_at" IS NULL;
CREATE INDEX "pomodoro_interval_session_id_started_at_idx" ON "pomodoro_interval"("session_id", "started_at");
CREATE UNIQUE INDEX "timebox_entry_user_id_id_key" ON "timebox_entry"("user_id", "id");
CREATE INDEX "timebox_entry_user_id_starts_at_idx" ON "timebox_entry"("user_id", "starts_at");
CREATE INDEX "timebox_entry_user_id_ends_at_idx" ON "timebox_entry"("user_id", "ends_at");

-- AddForeignKey
ALTER TABLE "habit" ADD CONSTRAINT "habit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "habit_schedule" ADD CONSTRAINT "habit_schedule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "habit_schedule" ADD CONSTRAINT "habit_schedule_user_id_habit_id_fkey" FOREIGN KEY ("user_id", "habit_id") REFERENCES "habit"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "habit_check_in" ADD CONSTRAINT "habit_check_in_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "habit_check_in" ADD CONSTRAINT "habit_check_in_user_id_habit_id_fkey" FOREIGN KEY ("user_id", "habit_id") REFERENCES "habit"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_user_id_cycle_day_id_fkey" FOREIGN KEY ("user_id", "cycle_day_id") REFERENCES "pomodoro_day"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_user_id_task_id_fkey" FOREIGN KEY ("user_id", "task_id") REFERENCES "task"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_user_id_project_id_at_start_fkey" FOREIGN KEY ("user_id", "project_id_at_start") REFERENCES "project"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pomodoro_interval" ADD CONSTRAINT "pomodoro_interval_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pomodoro_interval" ADD CONSTRAINT "pomodoro_interval_user_id_session_id_fkey" FOREIGN KEY ("user_id", "session_id") REFERENCES "pomodoro_session"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timebox_entry" ADD CONSTRAINT "timebox_entry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timebox_entry" ADD CONSTRAINT "timebox_entry_user_id_task_id_fkey" FOREIGN KEY ("user_id", "task_id") REFERENCES "task"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timebox_entry" ADD CONSTRAINT "timebox_entry_user_id_habit_id_fkey" FOREIGN KEY ("user_id", "habit_id") REFERENCES "habit"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
