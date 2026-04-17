import { randomBytes } from "node:crypto";
import * as readline from "node:readline";
import chalk from "chalk";
import { addAccount, getAccount, listAccounts, removeAccount } from "../lib/accounts.js";
import { gmailOAuthFlow } from "../lib/gmail.js";
import type { GmailAccount, ImapAccount } from "../lib/types.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function accountsAdd(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(chalk.bold("\nAdd email account\n"));
    const typeAnswer = await prompt(rl, "Account type — (1) Gmail  (2) IMAP: ");
    const type = typeAnswer.trim() === "1" ? "gmail" : "imap";

    if (type === "gmail") {
      console.log(chalk.dim("\nStarting Gmail OAuth flow..."));
      const { accessToken, refreshToken, email, expiry } = await gmailOAuthFlow();
      const label = await prompt(rl, `Label for this account [${email}]: `);

      const account: GmailAccount = {
        id: randomBytes(8).toString("hex"),
        type: "gmail",
        label: label.trim() || email,
        email,
        accessToken,
        refreshToken,
        tokenExpiry: expiry,
      };

      addAccount(account);
      console.log(chalk.green(`\nAdded Gmail account: ${email}`));
    } else {
      const host = await prompt(rl, "IMAP host (e.g. imap.gmail.com): ");
      const portStr = await prompt(rl, "Port [993]: ");
      const tlsAnswer = await prompt(rl, "Use TLS? [Y/n]: ");
      const username = await prompt(rl, "Username / email: ");
      const password = await prompt(rl, "Password: ");
      const label = await prompt(rl, `Label [${username}]: `);

      const account: ImapAccount = {
        id: randomBytes(8).toString("hex"),
        type: "imap",
        label: label.trim() || username,
        email: username,
        host: host.trim(),
        port: portStr.trim() ? parseInt(portStr.trim(), 10) : 993,
        tls: tlsAnswer.trim().toLowerCase() !== "n",
        username: username.trim(),
        password: password.trim(),
      };

      addAccount(account);
      console.log(chalk.green(`\nAdded IMAP account: ${username}`));
    }
  } finally {
    rl.close();
    process.stdin.destroy();
  }
}

export function accountsList(json: boolean): void {
  const accounts = listAccounts();

  if (json) {
    console.log(JSON.stringify(accounts, null, 2));
    return;
  }

  if (accounts.length === 0) {
    console.log(chalk.dim("\nNo accounts configured. Run: mmclaw accounts add\n"));
    return;
  }

  console.log(chalk.bold("\nConfigured accounts:\n"));
  for (const a of accounts) {
    console.log(`  ${chalk.cyan(a.id)}  ${a.label.padEnd(20)} ${chalk.dim(a.type)}  ${a.email}`);
  }
  console.log();
}

export function accountsRemove(idOrEmail: string): void {
  const account = getAccount(idOrEmail);
  if (!account) {
    console.error(chalk.red(`Account not found: ${idOrEmail}`));
    process.exit(1);
  }

  const removed = removeAccount(idOrEmail);
  if (removed) {
    console.log(chalk.green(`Removed account: ${account.email}`));
  }
}
