import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Email, EmailCategory } from "./types.js";

const DATA_DIR = join(fileURLToPath(import.meta.url), "..", "..", "..", "data");

interface RulesData {
  marketingDomains: string[];
  socialDomains: string[];
  marketingSenderPatterns: string[];
  marketingSubjectPatterns: string[];
  transactionalSubjectPatterns: string[];
}

function loadRules(): RulesData {
  return JSON.parse(readFileSync(join(DATA_DIR, "rules.json"), "utf-8"));
}

let _rules: RulesData | null = null;

function getRules(): RulesData {
  if (!_rules) _rules = loadRules();
  return _rules;
}

interface RuleMatch {
  category: EmailCategory;
  confidence: "high" | "medium";
}

export function applyRules(
  from: string,
  subject: string,
  hasUnsubscribe: boolean,
): RuleMatch | null {
  const rules = getRules();
  const fromLower = from.toLowerCase();
  const domain = fromLower.match(/@([\w.-]+)/)?.[1] ?? "";

  if (rules.socialDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { category: "social", confidence: "high" };
  }

  for (const pattern of rules.transactionalSubjectPatterns) {
    if (new RegExp(pattern, "i").test(subject)) {
      return { category: "transactional", confidence: "high" };
    }
  }

  if (rules.marketingDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { category: "marketing", confidence: "high" };
  }

  for (const pattern of rules.marketingSenderPatterns) {
    if (new RegExp(pattern, "i").test(fromLower)) {
      return { category: "marketing", confidence: "high" };
    }
  }

  for (const pattern of rules.marketingSubjectPatterns) {
    if (new RegExp(pattern, "i").test(subject)) {
      return { category: "marketing", confidence: "medium" };
    }
  }

  if (hasUnsubscribe) return { category: "newsletter", confidence: "medium" };

  return null;
}

export function categorizeByRules(
  emails: Pick<Email, "from" | "subject" | "hasUnsubscribe">[],
): (EmailCategory | null)[] {
  return emails.map((e) => applyRules(e.from, e.subject, e.hasUnsubscribe)?.category ?? null);
}
