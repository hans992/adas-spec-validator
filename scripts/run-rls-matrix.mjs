#!/usr/bin/env node
/**
 * Runs the SQL RLS matrix when SUPABASE_DB_URL (or DATABASE_URL) is set.
 * Otherwise prints the operator instructions and exits 0 so local/CI without
 * a database can still document the gate.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const matrix = join(process.cwd(), "supabase", "tests", "rls_test_matrix.sql");

if (!existsSync(matrix)) {
  console.error("RLS matrix file missing:", matrix);
  process.exit(1);
}

if (!url) {
  console.log(`RLS matrix not executed (no SUPABASE_DB_URL / DATABASE_URL).

To run against a live database:

  supabase db reset
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test_matrix.sql

Expect the script to print: RLS MATRIX PASSED
`);
  process.exit(0);
}

const result = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", matrix], {
  encoding: "utf8",
  stdio: "inherit"
});
process.exit(result.status ?? 1);
