import Database from "better-sqlite3";
import { getDbPath } from "./config.js";
import type { Email } from "./types.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized — call initDb() first");
  return db;
}

export function initDb(): void {
  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id                  TEXT NOT NULL,
      account_id          TEXT NOT NULL,
      date                TEXT NOT NULL,
      from_addr           TEXT NOT NULL,
      subject             TEXT NOT NULL,
      snippet             TEXT NOT NULL DEFAULT '',
      category            TEXT NOT NULL DEFAULT 'unknown',
      summary             TEXT,
      has_unsubscribe     INTEGER NOT NULL DEFAULT 0,
      unsubscribe_header  TEXT,
      scanned_at          TEXT NOT NULL,
      PRIMARY KEY (id, account_id)
    );

    CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
    CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id);
    CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date);
    CREATE INDEX IF NOT EXISTS idx_emails_unsubscribe ON emails(has_unsubscribe);
  `);

  try {
    db.exec(`ALTER TABLE emails ADD COLUMN unsubscribe_header TEXT`);
  } catch {
    // column already exists — safe to ignore
  }
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export function upsertEmail(email: Email): void {
  getDb()
    .prepare(
      `INSERT INTO emails (id, account_id, date, from_addr, subject, snippet, category, summary, has_unsubscribe, unsubscribe_header, scanned_at)
       VALUES (@id, @accountId, @date, @from, @subject, @snippet, @category, @summary, @hasUnsubscribe, @unsubscribeHeader, @scannedAt)
       ON CONFLICT(id, account_id) DO UPDATE SET
         category = excluded.category,
         summary = excluded.summary,
         unsubscribe_header = excluded.unsubscribe_header,
         scanned_at = excluded.scanned_at`,
    )
    .run({
      id: email.id,
      accountId: email.accountId,
      date: email.date,
      from: email.from,
      subject: email.subject,
      snippet: email.snippet,
      category: email.category,
      summary: email.summary ?? null,
      hasUnsubscribe: email.hasUnsubscribe ? 1 : 0,
      unsubscribeHeader: email.unsubscribeHeader ?? null,
      scannedAt: email.scannedAt,
    });
}

export function getEmails(opts: {
  accountId?: string;
  category?: string;
  olderThan?: Date;
  limit?: number;
  hasUnsubscribe?: boolean;
}): Email[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (opts.accountId) {
    conditions.push("account_id = @accountId");
    params.accountId = opts.accountId;
  }
  if (opts.category) {
    conditions.push("category = @category");
    params.category = opts.category;
  }
  if (opts.olderThan) {
    conditions.push("date < @olderThan");
    params.olderThan = opts.olderThan.toISOString();
  }
  if (opts.hasUnsubscribe !== undefined) {
    conditions.push("has_unsubscribe = @hasUnsubscribe");
    params.hasUnsubscribe = opts.hasUnsubscribe ? 1 : 0;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ? `LIMIT ${opts.limit}` : "";

  const rows = getDb()
    .prepare(`SELECT * FROM emails ${where} ORDER BY date DESC ${limit}`)
    .all(params) as Record<string, unknown>[];

  return rows.map(rowToEmail);
}

export function countByCategory(accountId?: string): Record<string, number> {
  const where = accountId ? "WHERE account_id = ?" : "";
  const params = accountId ? [accountId] : [];
  const rows = getDb()
    .prepare(`SELECT category, COUNT(*) as count FROM emails ${where} GROUP BY category`)
    .all(...params) as { category: string; count: number }[];
  return Object.fromEntries(rows.map((r) => [r.category, r.count]));
}

function rowToEmail(row: Record<string, unknown>): Email {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    date: row.date as string,
    from: row.from_addr as string,
    subject: row.subject as string,
    snippet: row.snippet as string,
    category: row.category as Email["category"],
    summary: row.summary as string | null,
    hasUnsubscribe: row.has_unsubscribe === 1,
    unsubscribeHeader: row.unsubscribe_header as string | null,
    scannedAt: row.scanned_at as string,
  };
}
