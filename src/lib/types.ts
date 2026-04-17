export type EmailCategory =
  | "marketing"
  | "newsletter"
  | "transactional"
  | "personal"
  | "work"
  | "social"
  | "unknown";

export type EmailAction = "delete" | "archive";

export type AccountType = "gmail" | "imap";

export interface Account {
  id: string;
  type: AccountType;
  label: string;
  email: string;
}

export interface GmailAccount extends Account {
  type: "gmail";
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
}

export interface ImapAccount extends Account {
  type: "imap";
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password: string;
}

export interface Email {
  id: string;
  accountId: string;
  date: string;
  from: string;
  subject: string;
  snippet: string;
  category: EmailCategory;
  summary: string | null;
  hasUnsubscribe: boolean;
  unsubscribeHeader: string | null;
  scannedAt: string;
}

export interface CleanupEntry {
  id: string;
  accountId: string;
  date: string;
  from: string;
  subject: string;
  summary: string | null;
  category: EmailCategory;
  action: EmailAction;
}

export interface ScanOptions {
  account?: string;
  limit?: number;
  ai?: boolean;
  since?: string;
}

export interface ListOptions {
  category?: EmailCategory;
  account?: string;
  limit?: number;
}

export interface CleanOptions {
  dryRun?: boolean;
  fromFile?: string;
  category?: EmailCategory;
  olderThan?: string;
  action?: EmailAction;
  account?: string;
}

export interface MymailclawConfig {
  provider: "anthropic" | "openai";
  model: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
}
