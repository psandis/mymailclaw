import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, countByCategory, getEmails, initDb, upsertEmail } from "../src/lib/db.js";
import type { Email } from "../src/lib/types.js";

let tmpDir: string;

const makeEmail = (overrides: Partial<Email> = {}): Email => ({
  id: "msg001",
  accountId: "acc001",
  date: "2026-04-01T10:00:00Z",
  from: "test@example.com",
  subject: "Test email",
  snippet: "This is a test",
  category: "personal",
  summary: null,
  hasUnsubscribe: false,
  scannedAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mymailclaw-test-"));
  process.env.MYMAILCLAW_HOME = tmpDir;
  initDb();
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.MYMAILCLAW_HOME;
});

describe("upsertEmail", () => {
  it("inserts a new email", () => {
    upsertEmail(makeEmail());
    const emails = getEmails({});
    expect(emails).toHaveLength(1);
    expect(emails[0].id).toBe("msg001");
  });

  it("updates category on re-scan", () => {
    upsertEmail(makeEmail({ category: "unknown" }));
    upsertEmail(makeEmail({ category: "marketing" }));
    const emails = getEmails({});
    expect(emails).toHaveLength(1);
    expect(emails[0].category).toBe("marketing");
  });

  it("stores summary", () => {
    upsertEmail(makeEmail({ summary: "A promotional email about discounts." }));
    const emails = getEmails({});
    expect(emails[0].summary).toBe("A promotional email about discounts.");
  });
});

describe("getEmails", () => {
  beforeEach(() => {
    upsertEmail(makeEmail({ id: "m1", category: "marketing", accountId: "acc1" }));
    upsertEmail(makeEmail({ id: "m2", category: "newsletter", accountId: "acc1" }));
    upsertEmail(makeEmail({ id: "m3", category: "marketing", accountId: "acc2" }));
  });

  it("returns all emails with no filter", () => {
    expect(getEmails({})).toHaveLength(3);
  });

  it("filters by category", () => {
    const results = getEmails({ category: "marketing" });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.category === "marketing")).toBe(true);
  });

  it("filters by accountId", () => {
    const results = getEmails({ accountId: "acc1" });
    expect(results).toHaveLength(2);
  });

  it("respects limit", () => {
    expect(getEmails({ limit: 2 })).toHaveLength(2);
  });

  it("filters by olderThan", () => {
    upsertEmail(makeEmail({ id: "m4", date: "2020-01-01T00:00:00Z" }));
    const results = getEmails({ olderThan: new Date("2021-01-01") });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("m4");
  });
});

describe("countByCategory", () => {
  it("counts all emails by category", () => {
    upsertEmail(makeEmail({ id: "m1", category: "marketing" }));
    upsertEmail(makeEmail({ id: "m2", category: "marketing" }));
    upsertEmail(makeEmail({ id: "m3", category: "newsletter" }));
    const counts = countByCategory();
    expect(counts.marketing).toBe(2);
    expect(counts.newsletter).toBe(1);
  });

  it("counts by category for a specific account", () => {
    upsertEmail(makeEmail({ id: "m1", category: "marketing", accountId: "acc1" }));
    upsertEmail(makeEmail({ id: "m2", category: "marketing", accountId: "acc2" }));
    const counts = countByCategory("acc1");
    expect(counts.marketing).toBe(1);
  });
});
