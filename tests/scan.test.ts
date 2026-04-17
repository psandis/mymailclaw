import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAccount } from "../src/lib/accounts.js";
import { closeDb, getEmails, initDb } from "../src/lib/db.js";
import type { GmailAccount } from "../src/lib/types.js";

vi.mock("../src/lib/gmail.js", () => ({
  fetchGmailEmails: vi.fn().mockResolvedValue([
    {
      id: "msg001",
      date: "2026-04-01T10:00:00Z",
      from: "noreply@mailchimp.com",
      subject: "Weekly deals",
      snippet: "Check out this week's offers",
      hasUnsubscribe: true,
    },
    {
      id: "msg002",
      date: "2026-04-01T11:00:00Z",
      from: "orders@shop.com",
      subject: "Order confirmation #999",
      snippet: "Your order has been placed",
      hasUnsubscribe: false,
    },
    {
      id: "msg003",
      date: "2026-04-01T12:00:00Z",
      from: "friend@gmail.com",
      subject: "Hey!",
      snippet: "Long time no see",
      hasUnsubscribe: false,
    },
  ]),
}));

vi.mock("../src/lib/imap.js", () => ({
  fetchImapEmails: vi.fn().mockResolvedValue([]),
}));

let tmpDir: string;

const gmailAccount: GmailAccount = {
  id: "acc001",
  type: "gmail",
  label: "Test Gmail",
  email: "test@gmail.com",
  accessToken: "token",
  refreshToken: "refresh",
  tokenExpiry: Date.now() + 3600_000,
};

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

describe("scan command", () => {
  it("stores fetched emails in db", async () => {
    const { scan } = await import("../src/commands/scan.js");
    await scan({ ai: false }, true);
    const emails = getEmails({});
    expect(emails).toHaveLength(3);
  });

  it("categorizes marketing email by rules", async () => {
    const { scan } = await import("../src/commands/scan.js");
    await scan({ ai: false }, true);
    const emails = getEmails({ category: "marketing" });
    expect(emails.some((e) => e.id === "msg001")).toBe(true);
  });

  it("categorizes transactional email by rules", async () => {
    const { scan } = await import("../src/commands/scan.js");
    await scan({ ai: false }, true);
    const emails = getEmails({ category: "transactional" });
    expect(emails.some((e) => e.id === "msg002")).toBe(true);
  });

  it("marks personal email as unknown without --ai", async () => {
    const { scan } = await import("../src/commands/scan.js");
    await scan({ ai: false }, true);
    const emails = getEmails({ category: "unknown" });
    expect(emails.some((e) => e.id === "msg003")).toBe(true);
  });

  it("does not call AI when --ai is not set", async () => {
    const { scan } = await import("../src/commands/scan.js");
    const aiModule = await import("../src/lib/ai.js");
    const spy = vi.spyOn(aiModule, "categorizeWithAi");
    await scan({ ai: false }, true);
    expect(spy).not.toHaveBeenCalled();
  });
});
