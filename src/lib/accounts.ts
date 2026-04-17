import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureDataDir, getAccountsPath } from "./config.js";
import type { Account, GmailAccount, ImapAccount } from "./types.js";

type StoredAccount = GmailAccount | ImapAccount;

function loadAccounts(): StoredAccount[] {
  const path = getAccountsPath();
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveAccounts(accounts: StoredAccount[]): void {
  ensureDataDir();
  writeFileSync(getAccountsPath(), `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
}

export function getAccounts(): StoredAccount[] {
  return loadAccounts();
}

export function getAccount(idOrEmail: string): StoredAccount | undefined {
  return loadAccounts().find((a) => a.id === idOrEmail || a.email === idOrEmail);
}

export function addAccount(account: StoredAccount): void {
  const accounts = loadAccounts();
  const existing = accounts.findIndex((a) => a.id === account.id);
  if (existing >= 0) {
    accounts[existing] = account;
  } else {
    accounts.push(account);
  }
  saveAccounts(accounts);
}

export function removeAccount(idOrEmail: string): boolean {
  const accounts = loadAccounts();
  const filtered = accounts.filter((a) => a.id !== idOrEmail && a.email !== idOrEmail);
  if (filtered.length === accounts.length) return false;
  saveAccounts(filtered);
  return true;
}

export function listAccounts(): Account[] {
  return loadAccounts().map(({ id, type, label, email }) => ({ id, type, label, email }));
}
