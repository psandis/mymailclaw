import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { GmailAccount } from "./types.js";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

const REDIRECT_PORT = 9876;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

interface GmailCredentials {
  clientId: string;
  clientSecret: string;
}

function loadCredentials(): GmailCredentials {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Gmail OAuth credentials not found.\n" +
        "Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in ~/.mymailclaw/.env\n" +
        "See: https://console.cloud.google.com/apis/credentials",
    );
  }
  return { clientId, clientSecret };
}

export async function gmailOAuthFlow(): Promise<{
  accessToken: string;
  refreshToken: string;
  email: string;
  expiry: number;
}> {
  const creds = loadCredentials();
  const state = randomBytes(16).toString("hex");

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(creds.clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(GMAIL_SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`;

  console.log("\nOpen this URL in your browser to authorize Gmail access:\n");
  console.log(authUrl);
  console.log("\nWaiting for authorization...");

  const code = await waitForCallback(state);
  return exchangeCode(code, creds);
}

function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.end("Authorization failed. You may close this tab.");
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || state !== expectedState) {
        res.end("Invalid response. You may close this tab.");
        server.close();
        reject(new Error("Invalid OAuth callback"));
        return;
      }

      res.end("Authorization successful. You may close this tab.");
      server.close();
      resolve(code);
    });

    server.listen(REDIRECT_PORT, () => {});
    setTimeout(
      () => {
        server.close();
        reject(new Error("OAuth timeout — no response within 5 minutes"));
      },
      5 * 60 * 1000,
    );
  });
}

async function exchangeCode(
  code: string,
  creds: GmailCredentials,
): Promise<{ accessToken: string; refreshToken: string; email: string; expiry: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const email = await getGmailAddress(data.access_token);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    email,
    expiry: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(account: GmailAccount): Promise<string> {
  const creds = loadCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: account.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return data.access_token;
}

async function getValidToken(account: GmailAccount): Promise<string> {
  if (Date.now() < account.tokenExpiry - 60_000) return account.accessToken;
  return refreshAccessToken(account);
}

async function getGmailAddress(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to get Gmail profile");
  const data = (await res.json()) as { emailAddress: string };
  return data.emailAddress;
}

export interface RawEmail {
  id: string;
  date: string;
  from: string;
  subject: string;
  snippet: string;
  hasUnsubscribe: boolean;
  unsubscribeHeader: string | null;
}

export async function fetchGmailEmails(
  account: GmailAccount,
  opts: { limit?: number; since?: Date },
): Promise<RawEmail[]> {
  const token = await getValidToken(account);
  const hardLimit = opts.limit ?? Infinity;

  let query = "";
  if (opts.since) query = `after:${Math.floor(opts.since.getTime() / 1000)}`;

  const messages: { id: string }[] = [];
  let pageToken: string | undefined;

  do {
    const url =
      `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=500&q=${encodeURIComponent(query)}` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const listRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!listRes.ok) throw new Error(`Gmail list failed: ${await listRes.text()}`);
    const list = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    messages.push(...(list.messages ?? []));
    pageToken = list.nextPageToken;
  } while (pageToken && messages.length < hardLimit);

  if (messages.length > hardLimit) messages.splice(hardLimit);

  const CONCURRENCY = 10;
  const emails: RawEmail[] = [];
  for (let i = 0; i < messages.length; i += CONCURRENCY) {
    const batch = messages.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((msg) => fetchMessage(msg.id, token)));
    for (const detail of results) {
      if (detail) emails.push(detail);
    }
    process.stdout.write(`\r  Fetching messages... ${Math.min(i + CONCURRENCY, messages.length)}/${messages.length}`);
  }
  process.stdout.write("\n");
  return emails;
}

async function fetchMessage(id: string, token: string): Promise<RawEmail | null> {
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) return null;

  const msg = (await res.json()) as {
    id: string;
    snippet: string;
    payload: { headers: { name: string; value: string }[] };
  };

  const headers = msg.payload.headers ?? [];
  const get = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    id: msg.id,
    date: get("Date"),
    from: get("From"),
    subject: get("Subject"),
    snippet: msg.snippet ?? "",
    hasUnsubscribe: !!get("List-Unsubscribe"),
    unsubscribeHeader: get("List-Unsubscribe") || null,
  };
}

export async function deleteGmailEmail(account: GmailAccount, messageId: string): Promise<void> {
  const token = await getValidToken(account);
  await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function archiveGmailEmail(account: GmailAccount, messageId: string): Promise<void> {
  const token = await getValidToken(account);
  await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
  });
}
