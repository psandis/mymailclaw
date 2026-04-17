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
  date: "2026-04-01T10:00:00Z",
  from: "news@example.com",
  subject: "Newsletter",
  snippet: "Read more",
  category: "newsletter",
  summary: null,
  hasUnsubscribe: true,
  unsubscribeHeader: "<https://example.com/unsub?id=abc>, <mailto:unsub@example.com>",
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

describe("unsubscribe command — list mode", () => {
  it("lists emails with unsubscribe links in JSON", async () => {
    upsertEmail(makeEmail());
    const { unsubscribe } = await import("../src/commands/unsubscribe.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await unsubscribe({}, true);

    const result = JSON.parse(output[0]);
    expect(result.total).toBe(1);
    expect(result.emails[0].from).toBe("news@example.com");
    expect(result.emails[0].httpLinks).toContain("https://example.com/unsub?id=abc");
    expect(result.emails[0].mailtoLinks).toContain("mailto:unsub@example.com");

    vi.restoreAllMocks();
  });

  it("returns total:0 when no emails have unsubscribe headers", async () => {
    upsertEmail(makeEmail({ hasUnsubscribe: false, unsubscribeHeader: null }));
    const { unsubscribe } = await import("../src/commands/unsubscribe.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await unsubscribe({}, true);

    const result = JSON.parse(output[0]);
    expect(result.total).toBe(0);

    vi.restoreAllMocks();
  });

  it("filters by category", async () => {
    upsertEmail(makeEmail({ id: "msg001", category: "newsletter" }));
    upsertEmail(
      makeEmail({
        id: "msg002",
        category: "marketing",
        unsubscribeHeader: "<https://marketing.com/unsub>",
      }),
    );
    const { unsubscribe } = await import("../src/commands/unsubscribe.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await unsubscribe({ category: "newsletter" }, true);

    const result = JSON.parse(output[0]);
    expect(result.total).toBe(1);
    expect(result.emails[0].id).toBe("msg001");

    vi.restoreAllMocks();
  });
});

describe("unsubscribe command — execute mode", () => {
  it("follows HTTP links and reports done/failed", async () => {
    upsertEmail(makeEmail());
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { unsubscribe } = await import("../src/commands/unsubscribe.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await unsubscribe({ execute: true }, true);

    const result = JSON.parse(output[0]);
    expect(result.done).toBe(1);
    expect(result.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/unsub?id=abc",
      expect.objectContaining({ method: "GET" }),
    );

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports failed when HTTP request errors", async () => {
    upsertEmail(makeEmail({ unsubscribeHeader: "<https://example.com/unsub>" }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const { unsubscribe } = await import("../src/commands/unsubscribe.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await unsubscribe({ execute: true }, true);

    const result = JSON.parse(output[0]);
    expect(result.done).toBe(0);
    expect(result.failed).toBe(1);

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("skips mailto-only entries and shows message", async () => {
    upsertEmail(makeEmail({ unsubscribeHeader: "<mailto:unsub@example.com>" }));

    const { unsubscribe } = await import("../src/commands/unsubscribe.js");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => output.push(String(s)));

    await unsubscribe({ execute: true }, false);

    expect(output.join(" ")).toMatch(/mailto/i);

    vi.restoreAllMocks();
  });
});
