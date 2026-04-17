import type { Email, EmailCategory } from "./types.js";
import rulesData from "../../data/rules.json" with { type: "json" };

interface RulesData {
  marketingDomains: string[];
  socialDomains: string[];
  marketingSenderPatterns: string[];
  marketingSubjectPatterns: string[];
  transactionalSubjectPatterns: string[];
}

function getRules(): RulesData {
  return rulesData as RulesData;
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
