import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline";
import chalk from "chalk";
import { getAccount } from "../lib/accounts.js";
import { getExportsDir } from "../lib/config.js";
import { getEmails } from "../lib/db.js";
import { archiveGmailEmail, deleteGmailEmail } from "../lib/gmail.js";
import { archiveImapEmail, deleteImapEmail } from "../lib/imap.js";
import type {
  CleanOptions,
  CleanupEntry,
  EmailAction,
  GmailAccount,
  ImapAccount,
} from "../lib/types.js";

function parseDays(olderThan?: string): Date | undefined {
  if (!olderThan) return undefined;
  const match = olderThan.match(/^(\d+)(d|w|m)$/);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit === "d" ? n * 86400000 : unit === "w" ? n * 7 * 86400000 : n * 30 * 86400000;
  return new Date(Date.now() - ms);
}

function exportFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(getExportsDir(), `cleanup-${date}.json`);
}

export async function clean(opts: CleanOptions, json: boolean): Promise<void> {
  if (opts.fromFile && opts.dryRun === false) {
    console.error(chalk.red("Cannot use --from-file and --execute together. --from-file always requires confirmation."));
    process.exit(1);
  }

  if (opts.fromFile) {
    await executeFromFile(opts.fromFile, json);
    return;
  }

  const emails = getEmails({
    accountId: opts.account,
    category: opts.category,
    olderThan: parseDays(opts.olderThan),
  });

  if (emails.length === 0) {
    if (!json) console.log(chalk.dim("\nNo emails match the filter.\n"));
    else console.log(JSON.stringify({ matched: 0 }));
    return;
  }

  const action: EmailAction = opts.action ?? "delete";

  const entries: CleanupEntry[] = emails.map((e) => ({
    id: e.id,
    accountId: e.accountId,
    date: e.date,
    from: e.from,
    subject: e.subject,
    summary: e.summary,
    category: e.category,
    action,
  }));

  if (opts.dryRun !== false) {
    const filePath = exportFilePath();
    writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`);

    if (json) {
      console.log(JSON.stringify({ dryRun: true, matched: entries.length, file: filePath }));
    } else {
      console.log(chalk.bold(`\nDry run — ${entries.length} emails matched\n`));
      for (const e of entries.slice(0, 20)) {
        console.log(
          `  ${chalk.dim(e.id.slice(0, 10))}  ${chalk.red(e.action.padEnd(12))}  ${e.from.slice(0, 30).padEnd(30)}  ${e.subject.slice(0, 50)}`,
        );
      }
      if (entries.length > 20) console.log(chalk.dim(`  ... and ${entries.length - 20} more`));
      console.log(chalk.yellow(`\nReview and edit: ${filePath}`));
      console.log(chalk.dim(`Then run: mmclaw clean --from-file ${filePath}\n`));
    }
    return;
  }

  if (!json) {
    console.log(chalk.bold(`\n${chalk.red("WARNING")} — about to ${action} ${entries.length} emails. This cannot be undone.\n`));
    for (const e of entries.slice(0, 20)) {
      console.log(
        `  ${chalk.dim(e.id.slice(0, 10))}  ${chalk.red(action.padEnd(12))}  ${e.from.slice(0, 30).padEnd(30)}  ${e.subject.slice(0, 50)}`,
      );
    }
    if (entries.length > 20) console.log(chalk.dim(`  ... and ${entries.length - 20} more`));

    const confirmed = await confirm(`\nProceed with ${action} on ${entries.length} emails? [y/N]: `);
    if (!confirmed) {
      console.log(chalk.dim("Cancelled.\n"));
      return;
    }
  }

  await executeEntries(entries, json);
}

async function executeFromFile(filePath: string, json: boolean): Promise<void> {
  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`));
    process.exit(1);
  }

  const entries: CleanupEntry[] = JSON.parse(readFileSync(filePath, "utf-8"));

  if (!json) {
    console.log(chalk.bold(`\n${entries.length} emails in file. Actions:\n`));
    const byAction = entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.action] = (acc[e.action] ?? 0) + 1;
      return acc;
    }, {});
    for (const [action, count] of Object.entries(byAction)) {
      console.log(`  ${action.padEnd(14)} ${count}`);
    }

    const confirmed = await confirm(`\nProceed? [y/N]: `);
    if (!confirmed) {
      console.log(chalk.dim("Cancelled.\n"));
      return;
    }
  }

  await executeEntries(entries, json);
}

async function executeEntries(entries: CleanupEntry[], json: boolean): Promise<void> {
  let done = 0;
  let failed = 0;

  for (const entry of entries) {
    const account = getAccount(entry.accountId);
    if (!account) {
      failed++;
      continue;
    }

    try {
      if (account.type === "gmail") {
        if (entry.action === "delete") await deleteGmailEmail(account as GmailAccount, entry.id);
        else if (entry.action === "archive")
          await archiveGmailEmail(account as GmailAccount, entry.id);
      } else {
        if (entry.action === "delete") await deleteImapEmail(account as ImapAccount, entry.id);
        else if (entry.action === "archive")
          await archiveImapEmail(account as ImapAccount, entry.id);
      }
      done++;
      if (!json) process.stdout.write(`\r  ${done}/${entries.length} processed...`);
    } catch {
      failed++;
    }
  }

  if (json) {
    console.log(JSON.stringify({ done, failed, total: entries.length }));
  } else {
    console.log(
      `\n${chalk.green(`Done: ${done}`)}  ${failed > 0 ? chalk.red(`Failed: ${failed}`) : ""}\n`,
    );
  }
}

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}
