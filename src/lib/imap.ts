import { connect, type ImapSimple, type ImapSimpleOptions } from "imap-simple";
import type { RawEmail } from "./gmail.js";
import type { ImapAccount } from "./types.js";

export async function fetchImapEmails(
  account: ImapAccount,
  opts: { limit?: number; since?: Date },
): Promise<RawEmail[]> {
  const config: ImapSimpleOptions = {
    imap: {
      host: account.host,
      port: account.port,
      tls: account.tls,
      authTimeout: 10000,
      user: account.username,
      password: account.password,
    },
  };

  const connection: ImapSimple = await connect(config);
  await connection.openBox("INBOX");

  const sinceDate = opts.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dateStr = sinceDate.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  const messages = await connection.search(["ALL", ["SINCE", dateStr]], {
    bodies: ["HEADER.FIELDS (FROM SUBJECT DATE LIST-UNSUBSCRIBE)"],
    struct: false,
  });

  const limit = opts.limit ?? 100;
  const slice = messages.slice(0, limit);

  const emails: RawEmail[] = slice.map((msg) => {
    const header = msg.parts[0]?.body as Record<string, string[]> | undefined;
    const get = (key: string) => header?.[key]?.[0] ?? "";
    return {
      id: String(msg.attributes.uid),
      date: get("date"),
      from: get("from"),
      subject: get("subject"),
      snippet: "",
      hasUnsubscribe: !!get("list-unsubscribe"),
      unsubscribeHeader: get("list-unsubscribe") || null,
    };
  });

  await connection.end();
  return emails;
}

export async function deleteImapEmail(account: ImapAccount, uid: string): Promise<void> {
  const config: ImapSimpleOptions = {
    imap: {
      host: account.host,
      port: account.port,
      tls: account.tls,
      authTimeout: 10000,
      user: account.username,
      password: account.password,
    },
  };

  const connection = await connect(config);
  await connection.openBox("INBOX");
  await connection.deleteMessage(uid);
  await connection.end();
}

export async function archiveImapEmail(account: ImapAccount, uid: string): Promise<void> {
  const config: ImapSimpleOptions = {
    imap: {
      host: account.host,
      port: account.port,
      tls: account.tls,
      authTimeout: 10000,
      user: account.username,
      password: account.password,
    },
  };

  const connection = await connect(config);
  await connection.openBox("INBOX");
  await connection.moveMessage(uid, "Archive");
  await connection.end();
}
