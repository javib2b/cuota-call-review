#!/usr/bin/env node
// Apply a pending migration against Supabase using the service role key.
//
// Usage:
//   SUPABASE_SERVICE_KEY=your_key node scripts/apply-migration.mjs

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error("ERROR: Missing SUPABASE_SERVICE_KEY env var");
  console.error("Usage: SUPABASE_SERVICE_KEY=your_key node scripts/apply-migration.mjs");
  process.exit(1);
}

const sql = readFileSync(
  join(__dirname, "../supabase/migrations/003_gtm_profile_columns.sql"),
  "utf8"
).split("\n")
  .filter(l => !l.trim().startsWith("--") && l.trim())
  .join("\n");

// Supabase exposes a pg_dump/restore style SQL runner via the Management API.
// We use the REST inline function approach: call postgres via supabase-js rpc shim.
// Simplest: use the /rest/v1/rpc approach with a pre-existing exec_sql function,
// OR just report the SQL so the user can paste it.

console.log("\n──────────────────────────────────────────");
console.log("SQL to run in the Supabase SQL editor:");
console.log("  https://supabase.com/dashboard/project/vflmrqtpdrhnyvokquyu/sql");
console.log("──────────────────────────────────────────\n");
console.log(sql);
console.log("\n──────────────────────────────────────────");
console.log("Copy the SQL above and paste it into the Supabase SQL editor, then click Run.");
