import chalk from "chalk";
import { getAccount } from "../lib/accounts.js";
import { getEmails } from "../lib/db.js";
import type { Email } from "../lib/types.js";

export interface UnsubscribeOptions {
  account?: string;
  category?: string;
  limit?: number;
}

interface UnsubscribeResult {
  email: Email;
  httpLinks: string[];
  mailtoLinks: string[];
}

function parseUnsubscribeHeader(header: string): { httpLinks: string[]; mailtoLinks: string[] } {
  const httpLinks: string[] = [];
  const mailtoLinks: string[] = [];

  const parts = header.split(/,(?=\s*<)/);
  for (const part of parts) {
    const match = part.match(/<([^>]+)>/);
    if (!match) continue;
    const url = match[1].trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      httpLinks.push(url);
    } else if (url.startsWith("mailto:")) {
      mailtoLinks.push(url);
    }
  }

  return { httpLinks, mailtoLinks };
}

async function followHttpUnsubscribe(url: string): Promise<"ok" | "error"> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok || res.status < 500 ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function unsubscribe(
  opts: UnsubscribeOptions & { execute?: boolean; list?: boolean },
  json: boolean,
): Promise<void> {
  const emails = getEmails({
    accountId: opts.account ? getAccount(opts.account)?.id : undefined,
    category: opts.category,
    hasUnsubscribe: true,
    limit: opts.limit,
  });

  const parsed: UnsubscribeResult[] = emails
    .filter((e) => e.unsubscribeHeader)
    .map((e) => {
      const { httpLinks, mailtoLinks } = parseUnsubscribeHeader(e.unsubscribeHeader!);
      return { email: e, httpLinks, mailtoLinks };
    })
    .filter((r) => r.httpLinks.length > 0 || r.mailtoLinks.length > 0);

  if (opts.list || !opts.execute) {
    if (json) {
      console.log(JSON.stringify({ total: parsed.length, emails: parsed.map(toListEntry) }, null, 2));
      return;
    }

    if (parsed.length === 0) {
      console.log(chalk.dim("No emails with unsubscribe links found."));
      return;
    }

    console.log(chalk.bold(`\n${parsed.length} emails with unsubscribe links:\n`));
    for (const r of parsed) {
      const e = r.email;
      console.log(`  ${chalk.cyan(e.from.padEnd(40))} ${chalk.dim(e.subject.slice(0, 50))}`);
      for (const link of r.httpLinks) {
        console.log(`    ${chalk.green("HTTP")} ${chalk.dim(link.slice(0, 80))}`);
      }
      for (const link of r.mailtoLinks) {
        console.log(`    ${chalk.yellow("mailto")} ${chalk.dim(link.slice(0, 80))}`);
      }
    }

    const httpCount = parsed.filter((r) => r.httpLinks.length > 0).length;
    const mailtoOnly = parsed.filter((r) => r.httpLinks.length === 0 && r.mailtoLinks.length > 0).length;

    console.log(chalk.bold(`\nSummary:`));
    console.log(`  ${httpCount} can be unsubscribed automatically (HTTP)`);
    if (mailtoOnly > 0) {
      console.log(`  ${mailtoOnly} require manual action (mailto only)`);
    }
    console.log(chalk.dim(`\nRun with --execute to follow HTTP unsubscribe links.\n`));
    return;
  }

  // execute mode
  const withHttp = parsed.filter((r) => r.httpLinks.length > 0);
  const mailtoOnly = parsed.filter((r) => r.httpLinks.length === 0 && r.mailtoLinks.length > 0);

  if (withHttp.length === 0) {
    console.log(chalk.dim("No HTTP unsubscribe links to follow."));
    if (mailtoOnly.length > 0) {
      console.log(chalk.yellow(`${mailtoOnly.length} emails have mailto-only links — handle these manually.`));
    }
    return;
  }

  if (!json) {
    console.log(chalk.bold(`\nFollowing ${withHttp.length} HTTP unsubscribe links...\n`));
  }

  let done = 0;
  let failed = 0;
  const failedEmails: string[] = [];

  for (const r of withHttp) {
    const url = r.httpLinks[0];
    const result = await followHttpUnsubscribe(url);
    if (result === "ok") {
      done++;
      if (!json) console.log(`  ${chalk.green("✓")} ${r.email.from}`);
    } else {
      failed++;
      failedEmails.push(r.email.from);
      if (!json) console.log(`  ${chalk.red("✗")} ${r.email.from}`);
    }
  }

  if (mailtoOnly.length > 0 && !json) {
    console.log(chalk.yellow(`\n${mailtoOnly.length} emails skipped — mailto only, handle manually:`));
    for (const r of mailtoOnly) {
      console.log(`  ${chalk.dim(r.email.from)} — ${r.mailtoLinks[0]}`);
    }
  }

  if (json) {
    console.log(JSON.stringify({ done, failed, skippedMailto: mailtoOnly.length, failedEmails }));
  } else {
    console.log(chalk.bold(`\nDone: ${done}  Failed: ${failed}  Skipped (mailto): ${mailtoOnly.length}\n`));
  }
}

function toListEntry(r: UnsubscribeResult) {
  return {
    id: r.email.id,
    accountId: r.email.accountId,
    from: r.email.from,
    subject: r.email.subject,
    httpLinks: r.httpLinks,
    mailtoLinks: r.mailtoLinks,
  };
}
