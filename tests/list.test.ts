import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb, upsertEmail } from "../src/lib/db.js";
import type { Email } from "../src/lib/types.js";

const makeEmail = (overrides: Partial<Email> = {}): Email => ({
  id: "msg001",
  accountId: "acc001",
  date: "2026-04-01T10:00:00Z",
  from: "test@example.com",
  subject: "Test",
  snippet: "snippet",
  category: "marketing",
  summary: null,
  hasUnsubscribe: false,
  scannedAt: new Date().toISOString(),
  ...overrides,
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mymailclaw-test-"));
  process.env.MYMAILCLAW_HOME = tmpDir;
  initDb();
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.MYMAILCLAW_HOME;
  vi.restoreAllMocks();
});

describe("list command", () => {
  it("outputs JSON with all emails", async () => {
    upsertEmail(makeEmail({ id: "m1", category: "marketing" }));
    upsertEmail(makeEmail({ id: "m2", category: "newsletter" }));

    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(s));

    const { list } = await import("../src/commands/list.js");
    list({}, true);

    const parsed = JSON.parse(output[0]);
    expect(parsed).toHaveLength(2);
  });

  it("filters by category in JSON mode", async () => {
    upsertEmail(makeEmail({ id: "m1", category: "marketing" }));
    upsertEmail(makeEmail({ id: "m2", category: "newsletter" }));

    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(s));

    const { list } = await import("../src/commands/list.js");
    list({ category: "marketing" }, true);

    const parsed = JSON.parse(output[0]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].category).toBe("marketing");
  });

  it("shows empty message when no emails", async () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(s));

    const { list } = await import("../src/commands/list.js");
    list({}, false);

    expect(output.join("")).toContain("mmclaw scan");
  });
});
