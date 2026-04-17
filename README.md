# mymailclaw

[![npm](https://img.shields.io/npm/v/mymailclaw?style=flat-square)](https://www.npmjs.com/package/mymailclaw)

Email scanner, categorizer, and cleaner CLI for the OpenClaw ecosystem. Connects to Gmail and IMAP accounts, categorizes emails by rules (or AI), and lets you safely clean up your inbox with a review-first workflow.

## Commands

| Command | Description |
|---------|-------------|
| `mmclaw accounts add` | Add a Gmail or IMAP account |
| `mmclaw accounts list` | List configured accounts |
| `mmclaw accounts remove <id\|email>` | Remove an account |
| `mmclaw scan` | Fetch and categorize emails (rules only) |
| `mmclaw scan --ai` | Use AI to categorize uncertain emails |
| `mmclaw scan --since 7d` | Fetch emails since N days (`d`), weeks (`w`), or months (`m`) — e.g. `7d`, `2w`, `1m`, `365d` |
| `mmclaw scan --limit 200` | Cap emails fetched per account (default: all emails in the date range) |
| `mmclaw scan --account <id>` | Scan a specific account only |
| `mmclaw list` | Show all emails grouped by category |
| `mmclaw list --category marketing` | Filter by category |
| `mmclaw list --limit 50` | Limit results |
| `mmclaw clean --category marketing` | Preview what would be cleaned (dry-run by default) |
| `mmclaw clean --older-than 30d` | Filter emails older than N days (`d`), weeks (`w`), or months (`m`) — e.g. `30d`, `6m`, `2y` is not supported, use `730d` |
| `mmclaw clean --action archive` | Action to apply: `delete` moves to Trash, `archive` removes from Inbox but keeps the email (default: `delete`) |
| `mmclaw clean --execute` | Actually perform the cleanup — shows a WARNING and requires confirmation |
| `mmclaw clean --from-file <path>` | Execute cleanup from a reviewed dry-run file — always prompts confirmation |
| `mmclaw unsubscribe` | List emails with unsubscribe links (dry-run by default) |
| `mmclaw unsubscribe --execute` | Follow HTTP unsubscribe links automatically |
| `mmclaw unsubscribe --category newsletter` | Filter to a specific category |
| `mmclaw db stats` | Show database summary — total count, categories, date range, last scan |
| `mmclaw db clean --older-than 90d` | Preview emails to remove from local DB (dry-run by default) |
| `mmclaw db clean --older-than 90d --execute` | Actually remove emails from local DB |
| `mmclaw db clean --older-than 90d --category newsletter --execute` | Remove only newsletter emails older than 90 days from DB |
| `mmclaw db remove <id>` | Remove a single email record from local DB |

## Categories

Emails are categorized as: `marketing`, `newsletter`, `transactional`, `personal`, `work`, `social`, `unknown`.

Classification uses rule-based matching first (sender domain, subject patterns, List-Unsubscribe header). Add `--ai` to use AI for emails that rules cannot classify with confidence. Rules are defined in `data/rules.json` — not hardcoded.

## Cleanup Workflow

Cleanup is safe by design — dry-run is the default:

```bash
# 1. Preview — dry-run is the default, writes a review file
mmclaw clean --category marketing --older-than 30d

# 2. Review and edit the generated file at ~/.mymailclaw/exports/cleanup-YYYY-MM-DD.json
# Remove any entries you want to keep

# 3. Execute only what's in the file
mmclaw clean --from-file ~/.mymailclaw/exports/cleanup-2026-04-17.json
```

Each entry in the cleanup file includes the email ID, date, sender, subject, AI summary, category, and intended action. You stay in full control.

## DB Management

The local DB grows over time as you scan. Use `mmclaw db` to inspect and clean it up.

```bash
# Show full DB summary
mmclaw db stats

# Preview what would be removed (dry-run)
mmclaw db clean --older-than 90d
mmclaw db clean --older-than 90d --category newsletter

# Actually remove from DB (not from inbox)
mmclaw db clean --older-than 90d --execute
mmclaw db clean --older-than 90d --category newsletter --execute

# Remove a single record
mmclaw db remove <email-id>
```

`db clean` only removes records from the local SQLite database — it does not touch your inbox.

## Unsubscribe Workflow

`mmclaw unsubscribe` reads the `List-Unsubscribe` headers stored during scan and follows the HTTP links automatically. Mailto-only entries are flagged for manual action.

```bash
# Preview — lists all emails with unsubscribe links
mmclaw unsubscribe
mmclaw unsubscribe --category newsletter

# Execute — follow HTTP unsubscribe links
mmclaw unsubscribe --execute
```

HTTP links are followed with a GET request (with redirect following). Mailto entries cannot be automated — the output tells you which senders require manual action.

## Storage

All data stored at `~/.mymailclaw/`. Override with `MYMAILCLAW_HOME`.

```
~/.mymailclaw/
├── config.json        # AI provider, model, API keys
├── accounts.json      # Gmail tokens and IMAP credentials (mode 600)
├── mymailclaw.db      # SQLite — emails, categories, scan history
└── exports/           # Dry-run cleanup files
```

Nothing is hardcoded. No credentials ever touch the repository.

## Configuration

`~/.mymailclaw/config.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-haiku-4-5-20251001",
  "anthropicApiKey": "sk-ant-...",
  "openaiApiKey": "sk-..."
}
```

API keys are only needed when using `--ai`. Without `--ai`, no external calls are made.

### Gmail Setup

Gmail requires OAuth2. You need a Google Cloud project with the Gmail API enabled:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Enable **Gmail API** — APIs & Services → Library → search "Gmail API" → Enable
3. Create credentials — APIs & Services → Credentials → **Create Credentials → OAuth client ID**
4. Application type: **Desktop app**
5. Go to **OAuth consent screen** → add your Gmail address as a **test user**
6. Put your credentials in `~/.mymailclaw/.env`:

```
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-your-secret
```

Then run:

```bash
mmclaw accounts add
# Choose (1) Gmail — browser opens for authorization
```

### IMAP Setup

```bash
mmclaw accounts add
# Choose (2) IMAP — enter host, port, username, password
```

Credentials are stored with mode 600 in `~/.mymailclaw/accounts.json`.

## File Structure

```
mymailclaw/
├── src/
│   ├── cli.ts                  # CLI entry point
│   ├── commands/
│   │   ├── accounts.ts         # accounts add/list/remove
│   │   ├── scan.ts             # fetch + categorize
│   │   ├── list.ts             # list by category
│   │   ├── clean.ts            # dry-run + execute cleanup
│   │   ├── unsubscribe.ts      # list + follow unsubscribe links
│   │   └── db.ts               # db stats / clean / remove
│   └── lib/
│       ├── types.ts            # TypeScript interfaces
│       ├── config.ts           # config and paths
│       ├── accounts.ts         # account storage
│       ├── db.ts               # SQLite layer
│       ├── rules.ts            # rule-based categorization
│       ├── ai.ts               # AI categorization
│       ├── gmail.ts            # Gmail OAuth2 + API
│       └── imap.ts             # IMAP connection
├── data/
│   └── rules.json              # classification rules (domains, patterns)
├── tests/
│   ├── rules.test.ts
│   ├── db.test.ts
│   ├── accounts.test.ts
│   ├── config.test.ts
│   ├── ai.test.ts
│   ├── scan.test.ts
│   ├── list.test.ts
│   ├── clean.test.ts
│   ├── unsubscribe.test.ts
│   └── db-command.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── biome.json
├── LICENSE
└── README.md
```

## Requirements

- Node 22+
- For Gmail: Google Cloud project with Gmail API enabled
- For AI: Anthropic or OpenAI API key

## Install

```bash
npm install -g mymailclaw
```

The package is `mymailclaw` on npm. The binary is `mmclaw`.

## Usage

```bash
# First run — add an account
mmclaw accounts add

# Scan inbox
mmclaw scan --since 7d

# Review categories
mmclaw list
mmclaw list --category marketing

# Preview cleanup (dry-run by default)
mmclaw clean --category marketing --older-than 30d

# Execute after review
mmclaw clean --from-file ~/.mymailclaw/exports/cleanup-2026-04-17.json
```

## Testing

```bash
pnpm test
```

76 tests across 10 test files covering rules, db, accounts, config, AI, scan, list, clean, unsubscribe, and db commands.

## Development

```bash
pnpm install
pnpm build
pnpm dev
pnpm lint
pnpm test
```

## Related

- [psclawmcp](https://github.com/psandis/psclawmcp) — MCP server exposing OpenClaw tools to AI assistants

## License

See [MIT](LICENSE)
