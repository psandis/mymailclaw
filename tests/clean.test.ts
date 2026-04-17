import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAccount } from "../src/lib/accounts.js";
import { closeDb, initDb, upsertEmail } from "../src/lib/db.js";
import type { CleanupEntry, Email, GmailAccount } from "../src/lib/types.js";

vi.mock("../src/lib/gmail.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/gmail.js")>()),
  deleteGmailEmail: vi.fn().mockResolvedValue(undefined),
  archiveGmailEmail: vi.fn().mockResolvedValue(undefined),
}));

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
  date: "2026-04-01T10:00:00Z",
  from: "deals@shop.com",
  subject: "Sale",
  snippet: "Big sale",
  category: "marketing",
  summary: "Promotional email.",
  hasUnsubscribe: true,
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

describe("clean command — dry run", () => {
  it("writes a cleanup file and does not delete anything", async () => {
    upsertEmail(makeEmail());
    const { clean } = await import("../src/commands/clean.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await clean({ category: "marketing", dryRun: true }, true);

    const result = JSON.parse(output[0]);
    expect(result.dryRun).toBe(true);
    expect(result.matched).toBe(1);
    expect(existsSync(result.file)).toBe(true);

    const entries: CleanupEntry[] = JSON.parse(readFileSync(result.file, "utf-8"));
    expect(entries[0].id).toBe("msg001");
    expect(entries[0].action).toBe("delete");

    const { deleteGmailEmail } = await import("../src/lib/gmail.js");
    expect(deleteGmailEmail).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("returns matched:0 when no emails match filter", async () => {
    const { clean } = await import("../src/commands/clean.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await clean({ category: "marketing", dryRun: true }, true);

    expect(JSON.parse(output[0]).matched).toBe(0);
    vi.restoreAllMocks();
  });

  it("dry-run file contains id, from, subject, summary, category, action", async () => {
    upsertEmail(makeEmail({ summary: "A sale email." }));
    const { clean } = await import("../src/commands/clean.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await clean({ dryRun: true }, true);

    const result = JSON.parse(output[0]);
    const entries: CleanupEntry[] = JSON.parse(readFileSync(result.file, "utf-8"));
    const entry = entries[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("from");
    expect(entry).toHaveProperty("subject");
    expect(entry).toHaveProperty("summary");
    expect(entry).toHaveProperty("category");
    expect(entry).toHaveProperty("action");

    vi.restoreAllMocks();
  });
});

describe("clean command — from file", () => {
  it("executes deletions from a cleanup file", async () => {
    upsertEmail(makeEmail());
    const filePath = join(tmpDir, "cleanup.json");
    const entries: CleanupEntry[] = [
      {
        id: "msg001",
        accountId: "acc001",
        date: "2026-04-01",
        from: "deals@shop.com",
        subject: "Sale",
        summary: null,
        category: "marketing",
        action: "delete",
      },
    ];
    writeFileSync(filePath, JSON.stringify(entries));

    const { clean } = await import("../src/commands/clean.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await clean({ fromFile: filePath }, true);

    const { deleteGmailEmail } = await import("../src/lib/gmail.js");
    expect(deleteGmailEmail).toHaveBeenCalledWith(expect.objectContaining({ id: "acc001" }), "msg001");

    const result = JSON.parse(output[0]);
    expect(result.done).toBe(1);
    expect(result.failed).toBe(0);

    vi.restoreAllMocks();
  });

  it("errors when file does not exist", async () => {
    const { clean } = await import("../src/commands/clean.js");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(clean({ fromFile: "/nonexistent/file.json" }, true)).rejects.toThrow();
    exitSpy.mockRestore();
  });
});
