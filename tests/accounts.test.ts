import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  getAccount,
  getAccounts,
  listAccounts,
  removeAccount,
} from "../src/lib/accounts.js";
import type { GmailAccount, ImapAccount } from "../src/lib/types.js";

let tmpDir: string;

const gmailAccount = (): GmailAccount => ({
  id: "acc001",
  type: "gmail",
  label: "My Gmail",
  email: "test@gmail.com",
  accessToken: "token123",
  refreshToken: "refresh123",
  tokenExpiry: Date.now() + 3600_000,
});

const imapAccount = (): ImapAccount => ({
  id: "acc002",
  type: "imap",
  label: "Work IMAP",
  email: "work@company.com",
  host: "imap.company.com",
  port: 993,
  tls: true,
  username: "work@company.com",
  password: "secret",
});

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mymailclaw-test-"));
  process.env.MYMAILCLAW_HOME = tmpDir;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.MYMAILCLAW_HOME;
});

describe("addAccount / getAccounts", () => {
  it("adds a Gmail account", () => {
    addAccount(gmailAccount());
    const accounts = getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].type).toBe("gmail");
    expect(accounts[0].email).toBe("test@gmail.com");
  });

  it("adds an IMAP account", () => {
    addAccount(imapAccount());
    const accounts = getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].type).toBe("imap");
  });

  it("updates existing account on re-add with same id", () => {
    addAccount(gmailAccount());
    addAccount({ ...gmailAccount(), accessToken: "newtoken" });
    const accounts = getAccounts();
    expect(accounts).toHaveLength(1);
    const acc = accounts[0] as GmailAccount;
    expect(acc.accessToken).toBe("newtoken");
  });
});

describe("getAccount", () => {
  it("finds account by id", () => {
    addAccount(gmailAccount());
    const acc = getAccount("acc001");
    expect(acc?.email).toBe("test@gmail.com");
  });

  it("finds account by email", () => {
    addAccount(gmailAccount());
    const acc = getAccount("test@gmail.com");
    expect(acc?.id).toBe("acc001");
  });

  it("returns undefined for unknown id", () => {
    expect(getAccount("nonexistent")).toBeUndefined();
  });
});

describe("removeAccount", () => {
  it("removes by id", () => {
    addAccount(gmailAccount());
    expect(removeAccount("acc001")).toBe(true);
    expect(getAccounts()).toHaveLength(0);
  });

  it("removes by email", () => {
    addAccount(gmailAccount());
    expect(removeAccount("test@gmail.com")).toBe(true);
    expect(getAccounts()).toHaveLength(0);
  });

  it("returns false for unknown account", () => {
    expect(removeAccount("nobody@nowhere.com")).toBe(false);
  });
});

describe("listAccounts", () => {
  it("returns only safe fields — no tokens or passwords", () => {
    addAccount(gmailAccount());
    addAccount(imapAccount());
    const list = listAccounts();
    expect(list).toHaveLength(2);
    for (const a of list) {
      expect(a).not.toHaveProperty("accessToken");
      expect(a).not.toHaveProperty("refreshToken");
      expect(a).not.toHaveProperty("password");
    }
  });
});
