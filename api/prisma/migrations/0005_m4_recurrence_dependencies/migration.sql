-- M4 is intentionally additive. Existing manual tasks and transactions retain
-- null recurrence metadata and no historical occurrence/revision is backfilled.
CREATE TYPE "RecurrenceFrequency" AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE "RecurrenceStatus" AS ENUM ('active', 'stopped', 'expired');
CREATE TYPE "RecurrenceRevisionAction" AS ENUM ('created', 'edited', 'stopped');

CREATE TABLE "task_recurrence_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "project_id" UUID,
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "timezone" TEXT NOT NULL,
    "status" "RecurrenceStatus" NOT NULL DEFAULT 'active',
    "next_date" DATE,
    "last_generated_date" DATE,
    "processing_updated_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_recurrence_rule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_recurrence_rule_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "task_recurrence_rule_description_check" CHECK ("description" IS NULL OR char_length("description") <= 5000),
    CONSTRAINT "task_recurrence_rule_interval_check" CHECK ("interval" BETWEEN 1 AND 365),
    CONSTRAINT "task_recurrence_rule_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
    CONSTRAINT "task_recurrence_rule_timezone_check" CHECK (char_length(btrim("timezone")) > 0),
    CONSTRAINT "task_recurrence_rule_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "task_recurrence_revision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "action" "RecurrenceRevisionAction" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "effective_after" DATE,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_recurrence_revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_recurrence_revision_version_check" CHECK ("rule_version" >= 1)
);

CREATE TABLE "finance_recurrence_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "FinanceTransactionType" NOT NULL,
    "account_id" UUID NOT NULL,
    "to_account_id" UUID,
    "category_id" UUID,
    "amount" BIGINT NOT NULL,
    "note" TEXT,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "timezone" TEXT NOT NULL,
    "status" "RecurrenceStatus" NOT NULL DEFAULT 'active',
    "next_date" DATE,
    "last_generated_date" DATE,
    "processing_updated_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_recurrence_rule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_recurrence_rule_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "finance_recurrence_rule_note_check" CHECK ("note" IS NULL OR char_length("note") <= 2000),
    CONSTRAINT "finance_recurrence_rule_interval_check" CHECK ("interval" BETWEEN 1 AND 365),
    CONSTRAINT "finance_recurrence_rule_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
    CONSTRAINT "finance_recurrence_rule_timezone_check" CHECK (char_length(btrim("timezone")) > 0),
    CONSTRAINT "finance_recurrence_rule_version_check" CHECK ("version" >= 1),
    CONSTRAINT "finance_recurrence_rule_shape_check" CHECK (
      ("type" = 'transfer' AND "to_account_id" IS NOT NULL AND "to_account_id" <> "account_id" AND "category_id" IS NULL)
      OR
      ("type" IN ('income', 'expense') AND "to_account_id" IS NULL AND "category_id" IS NOT NULL)
    )
);

CREATE TABLE "finance_recurrence_revision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "action" "RecurrenceRevisionAction" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "effective_after" DATE,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_recurrence_revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_recurrence_revision_version_check" CHECK ("rule_version" >= 1)
);

CREATE TABLE "task_dependency" (
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "predecessor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_dependency_pkey" PRIMARY KEY ("task_id", "predecessor_id"),
    CONSTRAINT "task_dependency_not_self_check" CHECK ("task_id" <> "predecessor_id")
);

ALTER TABLE "task"
  ADD COLUMN "recurrence_rule_id" UUID,
  ADD COLUMN "occurrence_date" DATE,
  ADD COLUMN "rule_version" INTEGER,
  ADD CONSTRAINT "task_recurrence_metadata_check" CHECK (
    ("recurrence_rule_id" IS NULL AND "occurrence_date" IS NULL AND "rule_version" IS NULL)
    OR
    ("recurrence_rule_id" IS NOT NULL AND "occurrence_date" IS NOT NULL AND "rule_version" IS NOT NULL)
  );

ALTER TABLE "finance_transaction"
  ADD COLUMN "recurrence_rule_id" UUID,
  ADD COLUMN "occurrence_date" DATE,
  ADD COLUMN "rule_version" INTEGER,
  ADD CONSTRAINT "finance_transaction_recurrence_metadata_check" CHECK (
    ("recurrence_rule_id" IS NULL AND "occurrence_date" IS NULL AND "rule_version" IS NULL)
    OR
    ("recurrence_rule_id" IS NOT NULL AND "occurrence_date" IS NOT NULL AND "rule_version" IS NOT NULL)
  );

CREATE UNIQUE INDEX "task_recurrence_rule_user_id_id_key" ON "task_recurrence_rule"("user_id", "id");
CREATE INDEX "task_recurrence_rule_status_next_date_idx" ON "task_recurrence_rule"("status", "next_date");
CREATE UNIQUE INDEX "task_recurrence_revision_user_id_rule_id_rule_version_key" ON "task_recurrence_revision"("user_id", "rule_id", "rule_version");
CREATE INDEX "task_recurrence_revision_rule_id_rule_version_idx" ON "task_recurrence_revision"("rule_id", "rule_version");
CREATE UNIQUE INDEX "finance_recurrence_rule_user_id_id_key" ON "finance_recurrence_rule"("user_id", "id");
CREATE INDEX "finance_recurrence_rule_status_next_date_idx" ON "finance_recurrence_rule"("status", "next_date");
CREATE UNIQUE INDEX "finance_recurrence_revision_user_id_rule_id_rule_version_key" ON "finance_recurrence_revision"("user_id", "rule_id", "rule_version");
CREATE INDEX "finance_recurrence_revision_rule_id_rule_version_idx" ON "finance_recurrence_revision"("rule_id", "rule_version");
CREATE INDEX "task_dependency_predecessor_id_idx" ON "task_dependency"("predecessor_id");
CREATE UNIQUE INDEX "task_recurrence_rule_id_occurrence_date_key" ON "task"("recurrence_rule_id", "occurrence_date");
CREATE UNIQUE INDEX "finance_recurrence_rule_id_occurrence_date_key" ON "finance_transaction"("recurrence_rule_id", "occurrence_date");

ALTER TABLE "task_recurrence_rule" ADD CONSTRAINT "task_recurrence_rule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_recurrence_rule" ADD CONSTRAINT "task_recurrence_rule_user_id_project_id_fkey" FOREIGN KEY ("user_id", "project_id") REFERENCES "project"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_recurrence_revision" ADD CONSTRAINT "task_recurrence_revision_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_recurrence_revision" ADD CONSTRAINT "task_recurrence_revision_user_id_rule_id_fkey" FOREIGN KEY ("user_id", "rule_id") REFERENCES "task_recurrence_rule"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_recurrence_rule" ADD CONSTRAINT "finance_recurrence_rule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_recurrence_rule" ADD CONSTRAINT "finance_recurrence_rule_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "finance_account"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_recurrence_rule" ADD CONSTRAINT "finance_recurrence_rule_user_id_to_account_id_fkey" FOREIGN KEY ("user_id", "to_account_id") REFERENCES "finance_account"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_recurrence_rule" ADD CONSTRAINT "finance_recurrence_rule_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "finance_category"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_recurrence_revision" ADD CONSTRAINT "finance_recurrence_revision_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_recurrence_revision" ADD CONSTRAINT "finance_recurrence_revision_user_id_rule_id_fkey" FOREIGN KEY ("user_id", "rule_id") REFERENCES "finance_recurrence_rule"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_user_id_task_id_fkey" FOREIGN KEY ("user_id", "task_id") REFERENCES "task"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_user_id_predecessor_id_fkey" FOREIGN KEY ("user_id", "predecessor_id") REFERENCES "task"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_recurrence_rule_id_fkey" FOREIGN KEY ("user_id", "recurrence_rule_id") REFERENCES "task_recurrence_rule"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_recurrence_rule_id_rule_version_fkey" FOREIGN KEY ("user_id", "recurrence_rule_id", "rule_version") REFERENCES "task_recurrence_revision"("user_id", "rule_id", "rule_version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_transaction" ADD CONSTRAINT "finance_transaction_user_id_recurrence_rule_id_fkey" FOREIGN KEY ("user_id", "recurrence_rule_id") REFERENCES "finance_recurrence_rule"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_transaction" ADD CONSTRAINT "finance_transaction_user_id_recurrence_rule_id_rule_version_fkey" FOREIGN KEY ("user_id", "recurrence_rule_id", "rule_version") REFERENCES "finance_recurrence_revision"("user_id", "rule_id", "rule_version") ON DELETE RESTRICT ON UPDATE CASCADE;
