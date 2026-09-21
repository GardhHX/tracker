-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('created', 'edited', 'status_changed', 'project_changed', 'archived', 'unarchived');

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "completed_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_name_length_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "project_description_length_check" CHECK ("description" IS NULL OR char_length("description") <= 5000),
    CONSTRAINT "project_status_timestamps_check" CHECK (
      ("status" = 'active' AND "completed_at" IS NULL AND "archived_at" IS NULL) OR
      ("status" = 'completed' AND "completed_at" IS NOT NULL AND "archived_at" IS NULL) OR
      ("status" = 'archived' AND "archived_at" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "due_date" DATE,
    "completed_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_title_length_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "task_description_length_check" CHECK ("description" IS NULL OR char_length("description") <= 5000),
    CONSTRAINT "task_completion_check" CHECK (("status" = 'done') = ("completed_at" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "task_event" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "task_version" INTEGER NOT NULL,
    "event_type" "TaskEventType" NOT NULL,
    "from_status" "TaskStatus",
    "to_status" "TaskStatus" NOT NULL,
    "previous_project_id" UUID,
    "project_id_at_event" UUID,
    "task_title_snapshot" TEXT NOT NULL,
    "project_name_snapshot" TEXT,
    "archived" BOOLEAN NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_event_create_from_status_check" CHECK (("event_type" = 'created') = ("from_status" IS NULL))
);

-- CreateIndex
CREATE INDEX "project_user_id_status_idx" ON "project"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_user_id_id_key" ON "project"("user_id", "id");

-- CreateIndex
CREATE INDEX "task_user_id_status_due_date_idx" ON "task"("user_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "task_project_id_status_idx" ON "task"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_user_id_id_key" ON "task"("user_id", "id");

-- CreateIndex
CREATE INDEX "task_event_user_id_occurred_at_idx" ON "task_event"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "task_event_task_id_occurred_at_idx" ON "task_event"("task_id", "occurred_at");

-- CreateIndex
CREATE INDEX "task_event_project_id_at_event_occurred_at_idx" ON "task_event"("project_id_at_event", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_event_task_id_task_version_key" ON "task_event"("task_id", "task_version");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_project_id_fkey" FOREIGN KEY ("user_id", "project_id") REFERENCES "project"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_event" ADD CONSTRAINT "task_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_event" ADD CONSTRAINT "task_event_user_id_task_id_fkey" FOREIGN KEY ("user_id", "task_id") REFERENCES "task"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_event" ADD CONSTRAINT "task_event_user_id_project_id_at_event_fkey" FOREIGN KEY ("user_id", "project_id_at_event") REFERENCES "project"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_event" ADD CONSTRAINT "task_event_user_id_previous_project_id_fkey" FOREIGN KEY ("user_id", "previous_project_id") REFERENCES "project"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
