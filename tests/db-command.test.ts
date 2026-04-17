import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAccount } from "../src/lib/accounts.js";
import { closeDb, initDb, upsertEmail } from "../src/lib/db.js";
import type { Email, GmailAccount } from "../src/lib/types.js";

let tmpDir: string;

const gmailAccount: GmailAccount = {
  id: "acc001",
  type: "gmail",
  label: "Test",
  email: "test@gmail.com",
  accessToken: "token",
  refreshToken: "refresh",
  tokenExpiry: Date.now() + 3600_000,
};

const makeEmail = (overrides: Partial<Email> = {}): Email => ({
  id: "msg001",
  accountId: "acc001",
  date: "2026-01-01T10:00:00Z",
  from: "news@example.com",
  subject: "Newsletter",
  snippet: "Read more",
  category: "newsletter",
  summary: null,
  hasUnsubscribe: true,
  unsubscribeHeader: null,
  scannedAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mymailclaw-test-"));
  process.env.MYMAILCLAW_HOME = tmpDir;
  initDb();
  addAccount(gmailAccount);
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.MYMAILCLAW_HOME;
  vi.clearAllMocks();
});

describe("db stats", () => {
  it("returns total count and categories in JSON", async () => {
    upsertEmail(makeEmail({ id: "msg001", category: "newsletter" }));
    upsertEmail(makeEmail({ id: "msg002", category: "marketing" }));
    const { dbStats } = await import("../src/commands/db.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    dbStats({}, true);

    const result = JSON.parse(output[0]);
    expect(result.total).toBe(2);
    expect(result.categories.find((c: { category: string }) => c.category === "newsletter").count).toBe(1);

    vi.restoreAllMocks();
  });
});

describe("db clean", () => {
  it("dry-run shows matched count without deleting", async () => {
    upsertEmail(makeEmail({ id: "msg001", date: "2025-01-01T00:00:00Z" }));
    const { dbClean } = await import("../src/commands/db.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    dbClean({ olderThan: "30d" }, true);

    const result = JSON.parse(output[0]);
    expect(result.dryRun).toBe(true);
    expect(result.matched).toBe(1);

    vi.restoreAllMocks();
  });

  it("--execute deletes matching emails from DB", async () => {
    upsertEmail(makeEmail({ id: "msg001", date: "2025-01-01T00:00:00Z" }));
    upsertEmail(makeEmail({ id: "msg002", date: new Date().toISOString() }));
    const { dbClean } = await import("../src/commands/db.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    dbClean({ olderThan: "30d", execute: true }, true);

    const result = JSON.parse(output[0]);
    expect(result.deleted).toBe(1);

    vi.restoreAllMocks();
  });
});

describe("db remove", () => {
  it("removes a single email by id", async () => {
    upsertEmail(makeEmail({ id: "msg001" }));
    const { dbRemove } = await import("../src/commands/db.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    dbRemove("msg001", true);

    expect(JSON.parse(output[0]).deleted).toBe(1);

    vi.restoreAllMocks();
  });

  it("returns deleted:0 when id not found", async () => {
    const { dbRemove } = await import("../src/commands/db.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    dbRemove("nonexistent", true);

    expect(JSON.parse(output[0]).deleted).toBe(0);

    vi.restoreAllMocks();
  });
});
