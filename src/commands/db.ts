import chalk from "chalk";
import { getDb, getEmails } from "../lib/db.js";
import type { EmailCategory } from "../lib/types.js";

function parseDays(olderThan?: string): Date | undefined {
  if (!olderThan) return undefined;
  const match = olderThan.match(/^(\d+)(d|w|m)$/);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit === "d" ? n * 86400000 : unit === "w" ? n * 7 * 86400000 : n * 30 * 86400000;
  return new Date(Date.now() - ms);
}

export function dbStats(opts: { account?: string }, json: boolean): void {
  const db = getDb();

  const where = opts.account ? "WHERE account_id = ?" : "";
  const params = opts.account ? [opts.account] : [];

  const total = (
    db.prepare(`SELECT COUNT(*) as n FROM emails ${where}`).get(...params) as { n: number }
  ).n;

  const categories = db
    .prepare(`SELECT category, COUNT(*) as count FROM emails ${where} GROUP BY category ORDER BY count DESC`)
    .all(...params) as { category: string; count: number }[];

  const accounts = db
    .prepare(`SELECT account_id, COUNT(*) as count FROM emails GROUP BY account_id ORDER BY count DESC`)
    .all() as { account_id: string; count: number }[];

  const range = db
    .prepare(`SELECT MIN(date) as oldest, MAX(date) as newest, MAX(scanned_at) as last_scan FROM emails ${where}`)
    .get(...params) as { oldest: string; newest: string; last_scan: string };

  const withUnsub = (
    db.prepare(`SELECT COUNT(*) as n FROM emails ${where ? where + " AND" : "WHERE"} has_unsubscribe = 1`)
      .get(...params) as { n: number }
  ).n;

  if (json) {
    console.log(JSON.stringify({ total, categories, accounts, range, withUnsubscribe: withUnsub }, null, 2));
    return;
  }

  console.log(chalk.bold("\nDatabase stats:\n"));
  console.log(`  Total emails       ${total}`);
  console.log(`  With unsubscribe   ${withUnsub}`);
  console.log(`  Oldest email       ${range.oldest ?? "—"}`);
  console.log(`  Newest email       ${range.newest ?? "—"}`);
  console.log(`  Last scan          ${range.last_scan ? new Date(range.last_scan).toLocaleString() : "—"}`);

  console.log(chalk.bold("\nBy category:\n"));
  for (const { category, count } of categories) {
    console.log(`  ${category.padEnd(16)} ${count}`);
  }

  console.log(chalk.bold("\nBy account:\n"));
  for (const { account_id, count } of accounts) {
    console.log(`  ${account_id.padEnd(20)} ${count}`);
  }

  console.log();
}

export function dbClean(
  opts: { olderThan?: string; category?: string; execute?: boolean },
  json: boolean,
): void {
  const olderThan = parseDays(opts.olderThan);

  if (!olderThan) {
    console.error(chalk.red("--older-than is required (e.g. --older-than 90d)"));
    process.exit(1);
  }

  const emails = getEmails({
    category: opts.category as EmailCategory | undefined,
    olderThan,
  });

  if (emails.length === 0) {
    if (json) console.log(JSON.stringify({ matched: 0 }));
    else console.log(chalk.dim("\nNo emails match the filter.\n"));
    return;
  }

  if (!opts.execute) {
    if (json) {
      console.log(JSON.stringify({ dryRun: true, matched: emails.length }));
    } else {
      console.log(chalk.bold(`\nDry run — ${emails.length} emails would be removed from DB\n`));
      for (const e of emails.slice(0, 20)) {
        console.log(
          `  ${chalk.dim(e.id.slice(0, 10))}  ${new Date(e.date).toLocaleDateString()}  ${e.category.padEnd(14)}  ${e.from.slice(0, 30).padEnd(30)}  ${e.subject.slice(0, 40)}`,
        );
      }
      if (emails.length > 20) console.log(chalk.dim(`  ... and ${emails.length - 20} more`));
      console.log(chalk.dim(`\nRun with --execute to delete from DB.\n`));
    }
    return;
  }

  const db = getDb();
  const conditions: string[] = ["date < ?"];
  const params: unknown[] = [olderThan.toISOString()];
  if (opts.category) {
    conditions.push("category = ?");
    params.push(opts.category);
  }

  const result = db.prepare(`DELETE FROM emails WHERE ${conditions.join(" AND ")}`).run(...params);

  if (json) {
    console.log(JSON.stringify({ deleted: result.changes }));
  } else {
    console.log(chalk.green(`\nDeleted ${result.changes} emails from DB.\n`));
  }
}

export function dbRemove(id: string, json: boolean): void {
  const db = getDb();
  const result = db.prepare("DELETE FROM emails WHERE id = ?").run(id);

  if (result.changes === 0) {
    if (json) console.log(JSON.stringify({ deleted: 0 }));
    else console.log(chalk.red(`\nNo email found with id: ${id}\n`));
    return;
  }

  if (json) console.log(JSON.stringify({ deleted: 1 }));
  else console.log(chalk.green(`\nRemoved email ${id} from DB.\n`));
}
