import chalk from "chalk";
import { getAccount, getAccounts } from "../lib/accounts.js";
import { categorizeWithAi } from "../lib/ai.js";
import { loadConfig } from "../lib/config.js";
import { upsertEmail } from "../lib/db.js";
import { fetchGmailEmails } from "../lib/gmail.js";
import { fetchImapEmails } from "../lib/imap.js";
import { categorizeByRules } from "../lib/rules.js";
import type { Email, GmailAccount, ImapAccount, ScanOptions } from "../lib/types.js";

const AI_BATCH_SIZE = 20;

function parseSince(since?: string): Date | undefined {
  if (!since) return undefined;
  const match = since.match(/^(\d+)(d|w|m)$/);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit === "d" ? n * 86400000 : unit === "w" ? n * 7 * 86400000 : n * 30 * 86400000;
  return new Date(Date.now() - ms);
}

export async function scan(opts: ScanOptions, json: boolean): Promise<void> {
  const accounts = opts.account ? [getAccount(opts.account)].filter(Boolean) : getAccounts();

  if (accounts.length === 0) {
    console.error(chalk.red("No accounts configured. Run: mmclaw accounts add"));
    process.exit(1);
  }

  const since = parseSince(opts.since);
  const config = loadConfig();
  const results: Email[] = [];

  for (const account of accounts) {
    if (!account) continue;
    if (!json) console.log(chalk.dim(`\nFetching ${account.email}...`));

    let raw: Awaited<ReturnType<typeof fetchGmailEmails>>;
    try {
      raw =
        account.type === "gmail"
          ? await fetchGmailEmails(account as GmailAccount, { limit: opts.limit, since })
          : await fetchImapEmails(account as ImapAccount, { limit: opts.limit, since });
    } catch (err) {
      console.error(chalk.red(`  Failed: ${err instanceof Error ? err.message.split("\n")[0] : err}`));
      continue;
    }

    if (!json) console.log(chalk.dim(`  ${raw.length} emails fetched — applying rules...`));

    const ruleCategories = categorizeByRules(raw);
    const uncertain = raw.filter((_, i) => ruleCategories[i] === null);

    const aiResults: { category: Email["category"]; summary: string }[] = [];
    if (opts.ai && uncertain.length > 0) {
      if (!json) console.log(chalk.dim(`  ${uncertain.length} uncertain — calling AI...`));
      for (let i = 0; i < uncertain.length; i += AI_BATCH_SIZE) {
        const batch = uncertain.slice(i, i + AI_BATCH_SIZE);
        const batchResults = await categorizeWithAi(batch, config);
        aiResults.push(...batchResults);
      }
    }

    let aiIdx = 0;
    const now = new Date().toISOString();

    for (let i = 0; i < raw.length; i++) {
      const e = raw[i];
      const ruleCategory = ruleCategories[i];

      let category: Email["category"];
      let summary: string | null = null;

      if (ruleCategory !== null) {
        category = ruleCategory;
      } else if (opts.ai && aiResults.length > aiIdx) {
        const ai = aiResults[aiIdx++];
        category = ai.category;
        summary = ai.summary;
      } else {
        category = "unknown";
      }

      const email: Email = {
        id: e.id,
        accountId: account.id,
        date: e.date,
        from: e.from,
        subject: e.subject,
        snippet: e.snippet,
        category,
        summary,
        hasUnsubscribe: e.hasUnsubscribe,
        unsubscribeHeader: e.unsubscribeHeader,
        scannedAt: now,
      };

      upsertEmail(email);
      results.push(email);
    }

    if (!json) {
      const counts = results.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + 1;
        return acc;
      }, {});
      console.log(chalk.green(`  Done.`));
      for (const [cat, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${cat.padEnd(14)} ${count}`);
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ scanned: results.length, emails: results }, null, 2));
  } else {
    console.log(chalk.bold(`\nTotal scanned: ${results.length}\n`));
  }
}
