import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node22",
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  sourcemap: true,
  external: ["better-sqlite3", "@anthropic-ai/sdk", "openai", "imap-simple"],
});
