-- CreateEnum
CREATE TYPE "FinanceAccountType" AS ENUM ('cash', 'bank', 'ewallet');
CREATE TYPE "FinanceCategoryType" AS ENUM ('income', 'expense');
CREATE TYPE "FinanceTransactionType" AS ENUM ('income', 'expense', 'transfer');
CREATE TYPE "FinanceTransactionStatus" AS ENUM ('draft', 'posted', 'void');
CREATE TYPE "FinanceTransactionRevisionAction" AS ENUM ('created', 'edited', 'posted', 'voided');

-- CreateTable
CREATE TABLE "finance_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceAccountType" NOT NULL,
    "opening_balance" BIGINT NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_account_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "finance_account_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "finance_account_balance_change" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "account_version" INTEGER NOT NULL,
    "previous_balance" BIGINT,
    "new_balance" BIGINT NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_account_balance_change_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_account_balance_change_version_check" CHECK ("account_version" >= 1)
);

CREATE TABLE "finance_category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceCategoryType" NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_category_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_category_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "finance_category_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "finance_transaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "FinanceTransactionType" NOT NULL,
    "status" "FinanceTransactionStatus" NOT NULL DEFAULT 'posted',
    "account_id" UUID NOT NULL,
    "to_account_id" UUID,
    "category_id" UUID,
    "amount" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_transaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_transaction_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "finance_transaction_note_check" CHECK ("note" IS NULL OR char_length("note") <= 2000),
    CONSTRAINT "finance_transaction_version_check" CHECK ("version" >= 1),
    CONSTRAINT "finance_transaction_shape_check" CHECK (
      ("type" = 'transfer' AND "to_account_id" IS NOT NULL AND "to_account_id" <> "account_id" AND "category_id" IS NULL)
      OR
      ("type" IN ('income', 'expense') AND "to_account_id" IS NULL AND "category_id" IS NOT NULL)
    ),
    CONSTRAINT "finance_transaction_status_time_check" CHECK (
      ("status" = 'draft' AND "posted_at" IS NULL AND "voided_at" IS NULL)
      OR ("status" = 'posted' AND "posted_at" IS NOT NULL AND "voided_at" IS NULL)
      OR ("status" = 'void' AND "voided_at" IS NOT NULL)
    )
);

CREATE TABLE "finance_transaction_revision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "transaction_version" INTEGER NOT NULL,
    "action" "FinanceTransactionRevisionAction" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_transaction_revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_transaction_revision_version_check" CHECK ("transaction_version" >= 1)
);

CREATE TABLE "budget" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "limit_amount" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_limit_amount_check" CHECK ("limit_amount" > 0),
    CONSTRAINT "budget_month_check" CHECK (EXTRACT(DAY FROM "month") = 1),
    CONSTRAINT "budget_version_check" CHECK ("version" >= 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_account_user_id_id_key" ON "finance_account"("user_id", "id");
CREATE INDEX "finance_account_user_id_archived_at_idx" ON "finance_account"("user_id", "archived_at");
CREATE UNIQUE INDEX "finance_account_balance_change_account_id_account_version_key" ON "finance_account_balance_change"("account_id", "account_version");
CREATE INDEX "finance_account_balance_change_user_id_changed_at_idx" ON "finance_account_balance_change"("user_id", "changed_at");
CREATE UNIQUE INDEX "finance_category_user_id_id_key" ON "finance_category"("user_id", "id");
CREATE UNIQUE INDEX "finance_category_user_type_lower_name_key" ON "finance_category"("user_id", "type", lower("name"));
CREATE INDEX "finance_category_user_id_type_archived_at_idx" ON "finance_category"("user_id", "type", "archived_at");
CREATE UNIQUE INDEX "finance_transaction_user_id_id_key" ON "finance_transaction"("user_id", "id");
CREATE INDEX "finance_transaction_user_id_date_status_idx" ON "finance_transaction"("user_id", "date", "status");
CREATE INDEX "finance_transaction_account_id_status_idx" ON "finance_transaction"("account_id", "status");
CREATE INDEX "finance_transaction_to_account_id_status_idx" ON "finance_transaction"("to_account_id", "status");
CREATE UNIQUE INDEX "finance_transaction_revision_transaction_id_transaction_version_key" ON "finance_transaction_revision"("transaction_id", "transaction_version");
CREATE INDEX "finance_transaction_revision_user_id_changed_at_idx" ON "finance_transaction_revision"("user_id", "changed_at");
CREATE INDEX "finance_revision_transaction_version_idx" ON "finance_transaction_revision"("transaction_id", "transaction_version");
CREATE UNIQUE INDEX "budget_user_id_id_key" ON "budget"("user_id", "id");
CREATE UNIQUE INDEX "budget_user_id_category_id_month_key" ON "budget"("user_id", "category_id", "month");
CREATE INDEX "budget_user_id_month_idx" ON "budget"("user_id", "month");

-- AddForeignKey
ALTER TABLE "finance_account" ADD CONSTRAINT "finance_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_account_balance_change" ADD CONSTRAINT "finance_account_balance_change_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_account_balance_change" ADD CONSTRAINT "finance_account_balance_change_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "finance_account"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_transaction" ADD CONSTRAINT "finance_transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_transaction" ADD CONSTRAINT "finance_transaction_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "finance_account"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_transaction" ADD CONSTRAINT "finance_transaction_user_id_to_account_id_fkey" FOREIGN KEY ("user_id", "to_account_id") REFERENCES "finance_account"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_transaction" ADD CONSTRAINT "finance_transaction_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "finance_category"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_transaction_revision" ADD CONSTRAINT "finance_transaction_revision_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_transaction_revision" ADD CONSTRAINT "finance_transaction_revision_user_id_transaction_id_fkey" FOREIGN KEY ("user_id", "transaction_id") REFERENCES "finance_transaction"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget" ADD CONSTRAINT "budget_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget" ADD CONSTRAINT "budget_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "finance_category"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
