import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { EmailCategory, MymailclawConfig } from "./types.js";

interface EmailInput {
  from: string;
  subject: string;
  snippet: string;
}

interface AiResult {
  category: EmailCategory;
  summary: string;
}

const CATEGORIES: EmailCategory[] = [
  "marketing",
  "newsletter",
  "transactional",
  "personal",
  "work",
  "social",
  "unknown",
];

const SYSTEM_PROMPT = `You are an email categorizer. For each email, return a JSON array where each element has:
- "category": one of ${CATEGORIES.join(", ")}
- "summary": one sentence describing the email content

Return only the JSON array, no other text.`;

function buildUserPrompt(emails: EmailInput[]): string {
  const lines = emails.map(
    (e, i) => `${i + 1}. From: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`,
  );
  return `Categorize these ${emails.length} emails:\n\n${lines.join("\n\n")}`;
}

function parseResponse(text: string, count: number): AiResult[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array in AI response");
  const parsed = JSON.parse(match[0]) as { category: string; summary: string }[];
  if (!Array.isArray(parsed) || parsed.length !== count) {
    throw new Error(`Expected ${count} results, got ${parsed.length}`);
  }
  return parsed.map((r) => ({
    category: CATEGORIES.includes(r.category as EmailCategory)
      ? (r.category as EmailCategory)
      : "unknown",
    summary: r.summary ?? "",
  }));
}

export async function categorizeWithAi(
  emails: EmailInput[],
  config: MymailclawConfig,
): Promise<AiResult[]> {
  const prompt = buildUserPrompt(emails);

  if (config.provider === "anthropic") {
    if (!config.anthropicApiKey) throw new Error("Anthropic API key not configured");
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return parseResponse(text, emails.length);
  }

  if (!config.openaiApiKey) throw new Error("OpenAI API key not configured");
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });
  const text = response.choices[0]?.message?.content ?? "";
  return parseResponse(text, emails.length);
}
