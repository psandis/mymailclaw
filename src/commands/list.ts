import chalk from "chalk";
import { countByCategory, getEmails } from "../lib/db.js";
import type { Email, ListOptions } from "../lib/types.js";

const CATEGORY_COLORS: Record<string, (s: string) => string> = {
  marketing: chalk.red,
  newsletter: chalk.yellow,
  transactional: chalk.blue,
  personal: chalk.green,
  work: chalk.cyan,
  social: chalk.magenta,
  unknown: chalk.dim,
};

function colorCategory(cat: string): string {
  return (CATEGORY_COLORS[cat] ?? chalk.white)(cat);
}

export function list(opts: ListOptions, json: boolean): void {
  const emails = getEmails({
    accountId: opts.account,
    category: opts.category,
    limit: opts.limit,
  });

  if (json) {
    console.log(JSON.stringify(emails, null, 2));
    return;
  }

  if (emails.length === 0) {
    console.log(chalk.dim("\nNo emails found. Run: mmclaw scan\n"));
    return;
  }

  if (!opts.category) {
    const counts = countByCategory(opts.account);
    console.log(chalk.bold("\nEmail summary:\n"));
    for (const [cat, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${colorCategory(cat).padEnd(22)} ${count}`);
    }
    console.log();
  }

  console.log(chalk.bold(`${opts.category ? `Category: ${opts.category}` : "All emails"}\n`));

  for (const email of emails) {
    printEmail(email);
  }
}

function printEmail(email: Email): void {
  const date = new Date(email.date).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  console.log(
    `  ${chalk.dim(email.id.slice(0, 10))}  ${date}  ${colorCategory(email.category).padEnd(16)}  ` +
      `${chalk.dim(email.from.slice(0, 30).padEnd(30))}  ${email.subject.slice(0, 60)}`,
  );
  if (email.summary) {
    console.log(`  ${" ".repeat(52)}${chalk.dim(email.summary)}`);
  }
}
