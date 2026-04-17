import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MymailclawConfig } from "./types.js";

const DEFAULTS: MymailclawConfig = {
  provider: "anthropic",
  model: "claude-haiku-4-5-20251001",
};

export function getDataDir(): string {
  return process.env.MYMAILCLAW_HOME ?? join(homedir(), ".mymailclaw");
}

export function getDbPath(): string {
  return join(getDataDir(), "mymailclaw.db");
}

export function getAccountsPath(): string {
  return join(getDataDir(), "accounts.json");
}

export function getExportsDir(): string {
  return join(getDataDir(), "exports");
}

export function ensureDataDir(): void {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const exportsDir = getExportsDir();
  if (!existsSync(exportsDir)) mkdirSync(exportsDir, { recursive: true });
  loadDotEnv();
}

function loadDotEnv(): void {
  const envFile = join(getDataDir(), ".env");
  if (!existsSync(envFile)) return;
  const lines = readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

export function loadConfig(): MymailclawConfig {
  const configFile = join(getDataDir(), "config.json");
  if (!existsSync(configFile)) return { ...DEFAULTS };
  return { ...DEFAULTS, ...JSON.parse(readFileSync(configFile, "utf-8")) };
}

export function saveConfig(config: MymailclawConfig): void {
  ensureDataDir();
  writeFileSync(join(getDataDir(), "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}
