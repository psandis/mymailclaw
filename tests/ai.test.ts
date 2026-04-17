import { describe, expect, it, vi } from "vitest";
import { categorizeWithAi } from "../src/lib/ai.js";
import type { MymailclawConfig } from "../src/lib/types.js";

const anthropicConfig: MymailclawConfig = {
  provider: "anthropic",
  model: "claude-haiku-4-5-20251001",
  anthropicApiKey: "sk-ant-test",
};

const openaiConfig: MymailclawConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  openaiApiKey: "sk-test",
};

const emails = [
  { from: "deals@shop.com", subject: "50% off today", snippet: "Flash sale on all items" },
  { from: "alice@gmail.com", subject: "Dinner tonight?", snippet: "Are you free this evening?" },
];

const goodResponse = JSON.stringify([
  { category: "marketing", summary: "Promotional discount email." },
  { category: "personal", summary: "Personal dinner invitation." },
]);

const badCategoryResponse = JSON.stringify([
  { category: "gibberish", summary: "Something." },
  { category: "personal", summary: "Fine." },
]);

const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: goodResponse }],
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

const mockChatCreate = vi.fn().mockResolvedValue({
  choices: [{ message: { content: goodResponse } }],
});

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockChatCreate } };
  },
}));

describe("categorizeWithAi — anthropic", () => {
  it("returns category and summary for each email", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: goodResponse }],
    });
    const results = await categorizeWithAi(emails, anthropicConfig);
    expect(results).toHaveLength(2);
    expect(results[0].category).toBe("marketing");
    expect(results[0].summary).toBe("Promotional discount email.");
    expect(results[1].category).toBe("personal");
  });

  it("throws when API key is missing", async () => {
    await expect(
      categorizeWithAi(emails, { ...anthropicConfig, anthropicApiKey: undefined }),
    ).rejects.toThrow("Anthropic API key not configured");
  });
});

describe("categorizeWithAi — openai", () => {
  it("returns category and summary for each email", async () => {
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: goodResponse } }],
    });
    const results = await categorizeWithAi(emails, openaiConfig);
    expect(results).toHaveLength(2);
    expect(results[0].category).toBe("marketing");
    expect(results[1].category).toBe("personal");
  });

  it("throws when API key is missing", async () => {
    await expect(
      categorizeWithAi(emails, { ...openaiConfig, openaiApiKey: undefined }),
    ).rejects.toThrow("OpenAI API key not configured");
  });
});

describe("categorizeWithAi — response parsing", () => {
  it("falls back to unknown for unrecognized category", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: badCategoryResponse }],
    });
    const results = await categorizeWithAi(emails, anthropicConfig);
    expect(results[0].category).toBe("unknown");
    expect(results[1].category).toBe("personal");
  });
});
