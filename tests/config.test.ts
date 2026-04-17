import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAccountsPath,
  getDataDir,
  getDbPath,
  getExportsDir,
  loadConfig,
  saveConfig,
} from "../src/lib/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mymailclaw-test-"));
  process.env.MYMAILCLAW_HOME = tmpDir;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.MYMAILCLAW_HOME;
});

describe("getDataDir", () => {
  it("returns MYMAILCLAW_HOME when set", () => {
    expect(getDataDir()).toBe(tmpDir);
  });

  it("changes when env var changes", () => {
    const other = mkdtempSync(join(tmpdir(), "mymailclaw-other-"));
    process.env.MYMAILCLAW_HOME = other;
    expect(getDataDir()).toBe(other);
    rmSync(other, { recursive: true, force: true });
  });
});

describe("getDbPath", () => {
  it("returns db path inside data dir", () => {
    expect(getDbPath()).toBe(join(tmpDir, "mymailclaw.db"));
  });
});

describe("getAccountsPath", () => {
  it("returns accounts.json inside data dir", () => {
    expect(getAccountsPath()).toBe(join(tmpDir, "accounts.json"));
  });
});

describe("getExportsDir", () => {
  it("returns exports dir inside data dir", () => {
    expect(getExportsDir()).toBe(join(tmpDir, "exports"));
  });
});

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    const config = loadConfig();
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("claude-haiku-4-5-20251001");
  });

  it("merges saved values over defaults", () => {
    saveConfig({ provider: "openai", model: "gpt-4o" });
    const config = loadConfig();
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o");
  });

  it("keeps defaults for fields not in saved config", () => {
    saveConfig({ provider: "openai", model: "gpt-4o" });
    const config = loadConfig();
    expect(config).toHaveProperty("provider");
    expect(config).toHaveProperty("model");
  });
});

describe("saveConfig", () => {
  it("persists config that can be reloaded", () => {
    saveConfig({ provider: "openai", model: "gpt-4o", openaiApiKey: "sk-test" });
    const config = loadConfig();
    expect(config.openaiApiKey).toBe("sk-test");
  });

  it("creates data dir if it does not exist", () => {
    const nested = join(tmpDir, "nested");
    process.env.MYMAILCLAW_HOME = nested;
    saveConfig({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    expect(loadConfig().provider).toBe("anthropic");
    rmSync(nested, { recursive: true, force: true });
  });
});
