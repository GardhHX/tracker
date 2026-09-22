import assert from "node:assert/strict";
import test from "node:test";
import { firstOccurrenceAfter, nextOccurrenceDate } from "./service.prisma.js";
import { createFinanceRuleSchema, createTaskRuleSchema, patchTaskRuleSchema } from "./validation.js";

test("monthly recurrence keeps the anchor day through short months", () => {
  assert.equal(nextOccurrenceDate("2028-01-31", "monthly", 1, "2028-01-31"), "2028-02-29");
  assert.equal(nextOccurrenceDate("2028-01-31", "monthly", 1, "2028-02-29"), "2028-03-31");
  assert.equal(nextOccurrenceDate("2027-01-31", "monthly", 1, "2027-01-31"), "2027-02-28");
  assert.equal(nextOccurrenceDate("2028-01-31", "monthly", 2, "2028-01-31"), "2028-03-31");
});

test("next edited recurrence occurrence is strictly after its catch-up cutoff", () => {
  assert.equal(firstOccurrenceAfter("2026-01-31", "monthly", 1, "2026-02-28"), "2026-03-31");
  assert.equal(firstOccurrenceAfter("2026-09-01", "weekly", 2, "2026-09-20"), "2026-09-29");
  assert.equal(firstOccurrenceAfter("2026-09-01", "daily", 3, "2026-09-10"), "2026-09-13");
});

test("M4 rule payloads enforce bounded calendars and reject manual transaction dates", () => {
  assert.equal(createTaskRuleSchema.safeParse({ title: "Pay rent", frequency: "monthly", start_date: "2026-09-01", end_date: "2026-08-31" }).success, false);
  assert.equal(patchTaskRuleSchema.safeParse({ version: 1 }).success, false);
  assert.equal(createFinanceRuleSchema.safeParse({
    type: "expense", account_id: "11111111-1111-4111-8111-111111111111", category_id: "22222222-2222-4222-8222-222222222222",
    amount: "1000", frequency: "monthly", start_date: "2026-09-01", date: "2026-09-01",
  }).success, false);
});
