import { Command } from "commander";
import { ensureDataDir } from "./lib/config.js";
import { closeDb, initDb } from "./lib/db.js";

const program = new Command();

program.name("mmclaw").description("Email scanner, categorizer, and cleaner").version("0.1.0");

const accounts = program.command("accounts").description("Manage email accounts");

accounts
  .command("add")
  .description("Add a Gmail or IMAP account")
  .action(async () => {
    const { accountsAdd } = await import("./commands/accounts.js");
    ensureDataDir();
    await accountsAdd();
  });

accounts
  .command("list")
  .description("List configured accounts")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { accountsList } = await import("./commands/accounts.js");
    ensureDataDir();
    accountsList(!!opts.json);
  });

accounts
  .command("remove <id-or-email>")
  .description("Remove an account")
  .action(async (idOrEmail) => {
    const { accountsRemove } = await import("./commands/accounts.js");
    ensureDataDir();
    accountsRemove(idOrEmail);
  });

program
  .command("scan")
  .description("Fetch and categorize emails")
  .option("--account <id>", "Scan a specific account only")
  .option("--limit <n>", "Max emails to fetch per account", parseInt)
  .option("--since <period>", "Fetch emails since (e.g. 7d, 2w, 1m)")
  .option("--ai", "Use AI to categorize uncertain emails")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { scan } = await import("./commands/scan.js");
    ensureDataDir();
    initDb();
    try {
      await scan(
        {
          account: opts.account,
          limit: opts.limit,
          since: opts.since,
          ai: !!opts.ai,
        },
        !!opts.json,
      );
    } finally {
      closeDb();
    }
  });

program
  .command("list")
  .description("List emails by category")
  .option("--category <cat>", "Filter by category")
  .option("--account <id>", "Filter by account")
  .option("--limit <n>", "Max results", parseInt)
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { list } = await import("./commands/list.js");
    ensureDataDir();
    initDb();
    try {
      list(
        {
          category: opts.category,
          account: opts.account,
          limit: opts.limit,
        },
        !!opts.json,
      );
    } finally {
      closeDb();
    }
  });

program
  .command("clean")
  .description("Delete or archive emails (dry-run by default)")
  .option("--category <cat>", "Filter by category")
  .option("--older-than <period>", "Filter by age (e.g. 30d, 3m)")
  .option("--account <id>", "Filter by account")
  .option("--action <action>", "delete or archive (default: delete)")
  .option("--from-file <path>", "Execute cleanup from a dry-run file")
  .option("--execute", "Actually perform the cleanup (default is dry-run)")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { clean } = await import("./commands/clean.js");
    ensureDataDir();
    initDb();
    try {
      await clean(
        {
          category: opts.category,
          olderThan: opts.olderThan,
          account: opts.account,
          action: opts.action,
          fromFile: opts.fromFile,
          dryRun: !opts.execute,
        },
        !!opts.json,
      );
    } finally {
      closeDb();
    }
  });

const db = program.command("db").description("Manage the local email database");

db.command("stats")
  .description("Show database summary")
  .option("--account <id>", "Filter by account")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { dbStats } = await import("./commands/db.js");
    ensureDataDir();
    initDb();
    try {
      dbStats({ account: opts.account }, !!opts.json);
    } finally {
      closeDb();
    }
  });

db.command("clean")
  .description("Remove emails from the local DB (not from inbox)")
  .option("--older-than <period>", "Remove emails older than (e.g. 90d, 3m)")
  .option("--category <cat>", "Filter by category")
  .option("--execute", "Actually delete (default is dry-run)")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { dbClean } = await import("./commands/db.js");
    ensureDataDir();
    initDb();
    try {
      dbClean({ olderThan: opts.olderThan, category: opts.category, execute: !!opts.execute }, !!opts.json);
    } finally {
      closeDb();
    }
  });

db.command("remove <id>")
  .description("Remove a single email record from the local DB")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    const { dbRemove } = await import("./commands/db.js");
    ensureDataDir();
    initDb();
    try {
      dbRemove(id, !!opts.json);
    } finally {
      closeDb();
    }
  });

program
  .command("unsubscribe")
  .description("List and follow unsubscribe links from scanned emails")
  .option("--account <id>", "Filter by account")
  .option("--category <cat>", "Filter by category")
  .option("--limit <n>", "Max emails to process", parseInt)
  .option("--execute", "Actually follow HTTP unsubscribe links")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { unsubscribe } = await import("./commands/unsubscribe.js");
    ensureDataDir();
    initDb();
    try {
      await unsubscribe(
        {
          account: opts.account,
          category: opts.category,
          limit: opts.limit,
          execute: !!opts.execute,
        },
        !!opts.json,
      );
    } finally {
      closeDb();
    }
  });

program.parse();
