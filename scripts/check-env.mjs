#!/usr/bin/env node
/**
 * Environment sanity check.
 *
 * Verifies the things that fail *silently* at runtime — a pair of variables that
 * must hold the same value drifting apart, a group name with a stray space, a
 * site URL pointing at the wrong SharePoint site. None of these surface as an
 * error; they surface as an empty catalogue or a 401 on every API call.
 *
 * Never prints a secret. Only presence, and whether pairs match.
 *
 *   node scripts/check-env.mjs [path-to-env-file]   (default: .env.local)
 */
import { readFileSync } from "node:fs";

const file = process.argv[2] || ".env.local";

let raw;
try {
  raw = readFileSync(file, "utf8");
} catch {
  console.error(`Cannot read ${file}`);
  process.exit(2);
}

const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const set = (k) => typeof env[k] === "string" && env[k] !== "";
const lc = (k) => (env[k] || "").toLowerCase();

let failures = 0;
let warnings = 0;

function check(condition, message) {
  if (!condition) failures += 1;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${message}`);
}

function advise(condition, message) {
  if (!condition) warnings += 1;
  console.log(`  ${condition ? "PASS" : "WARN"}  ${message}`);
}

console.log(`\n${file} — ${Object.keys(env).length} keys\n`);

// main.tsx replaces the whole document with an error when any of these is missing.
console.log("Required to boot");
for (const key of ["VITE_AZURE_CLIENT_ID", "VITE_AZURE_TENANT_ID", "VITE_SP_SITE_URL"]) {
  check(set(key), key);
}

// Each pair is one value the code reads from two places. Drift is invisible until
// a request 401s or a stored date disagrees with the notice shown to the user.
console.log("\nPairs that must match");
check(set("API_SECRET_KEY") && env.API_SECRET_KEY === env.VITE_API_SECRET_KEY,
  "VITE_API_SECRET_KEY === API_SECRET_KEY  (mismatch = every API call 401s)");
check(set("OSHES_FORM_EMAIL_FROM_ADDRESS") &&
  lc("OSHES_FORM_EMAIL_FROM_ADDRESS") === lc("VITE_OSHES_FORM_EMAIL_FROM_ADDRESS"),
  "VITE_OSHES_FORM_EMAIL_FROM_ADDRESS === OSHES_FORM_EMAIL_FROM_ADDRESS");
advise(!set("PDPA_RETENTION_YEARS") || env.PDPA_RETENTION_YEARS === env.VITE_PDPA_RETENTION_YEARS,
  `PDPA_RETENTION_YEARS === VITE_PDPA_RETENTION_YEARS  (server uses ${env.PDPA_RETENTION_YEARS || "7, the default"})`);

console.log("\nSharePoint site");
const site = env.VITE_SP_SITE_URL || "";
check(!site.endsWith("/"), "no trailing slash");
check(site.includes("/sites/"), "contains /sites/");
if (site) {
  try {
    console.log(`  INFO  host ${new URL(site).host} · site ${site.split("/sites/")[1] || "?"}`);
  } catch {
    check(false, "VITE_SP_SITE_URL is a valid URL");
  }
}

// Every link in a workflow email is built from this, in the browser and in the
// API alike. Unset, each side falls back to the origin it happens to be on, so a
// send from a preview deployment or a local run mails out a URL the recipient
// cannot open. The mail still sends; nothing errors.
console.log("\nEmailed links");
const appBase = env.VITE_APP_BASE_URL || "";
advise(appBase !== "",
  "VITE_APP_BASE_URL set  (unset falls back to whichever origin the sender was on)");
if (appBase) {
  advise(!appBase.endsWith("/"), "no trailing slash  (tolerated — both readers strip it)");
  try {
    const parsed = new URL(appBase);
    check(parsed.pathname === "/", "an origin only — the app appends the path");
    console.log(`  INFO  emailed links -> ${parsed.origin}/eval/...`);
  } catch {
    check(false, "VITE_APP_BASE_URL is a valid URL");
  }
}

// Compared as literal strings against SharePoint group names. A trailing space
// reads as "no such group", which renders as an empty catalogue, not an error.
console.log("\nAccess groups (exact string match)");
for (const key of ["VITE_OSHES_ADMIN_GROUP", "VITE_OSHES_AUDITOR_GROUP"]) {
  if (!(key in env)) {
    // There is no default to fall back to — src/config/oshe.ts leaves both
    // blank on purpose, so unset means nobody resolves into the role.
    console.log(key === "VITE_OSHES_ADMIN_GROUP"
      ? `  WARN  ${key} unset — no account resolves as an admin, and every appearance save returns 403`
      : `  WARN  ${key} unset — no account resolves as an auditor`);
    warnings += 1;
    continue;
  }
  const value = env[key];
  const padded = value !== value.trim();
  if (padded) failures += 1;
  console.log(`  ${padded ? "FAIL" : "INFO"}  ${key} = [${value}]${padded ? "  <-- surrounding whitespace" : ""}`);
}

console.log("\nServer secrets present");
for (const key of ["SYSTEM_CLIENT_ID", "SYSTEM_CLIENT_SECRET",
  "SHAREPOINT_CERT_PFX_BASE64", "SHAREPOINT_CERT_PASSWORD", "CRON_SECRET"]) {
  check(set(key), key);
}

console.log("\nSafety");
check(!set("VITE_AZURE_CLIENT_SECRET"),
  "VITE_AZURE_CLIENT_SECRET unset  (a VITE_ prefix would ship it in the public bundle)");
advise(!(set("CRON_SECRET") && env.CRON_SECRET === env.API_SECRET_KEY),
  "CRON_SECRET differs from API_SECRET_KEY");

console.log("\nFeature flags");
console.log(set("VITE_BUILDER_URL")
  ? `  INFO  Form builder link -> ${env.VITE_BUILDER_URL}/admin/builder?site=oshes`
  : "  INFO  VITE_BUILDER_URL blank — the Form builder link is hidden");
if (set("VITE_BUILDER_URL") && /\/admin/.test(env.VITE_BUILDER_URL)) {
  check(false, "VITE_BUILDER_URL must be an origin only — the app appends the path");
}
// The sentinel is compared against each layer's assignee. Sharing it with the
// sender mailbox is a supported choice here, but it means any layer assigned to
// that address becomes paper instead of an online approval.
if (set("VITE_OSHES_MANUAL_PAPER_ADDRESS")) {
  const shared = lc("VITE_OSHES_MANUAL_PAPER_ADDRESS") === lc("OSHES_FORM_EMAIL_FROM_ADDRESS");
  console.log(`  INFO  manual-paper routing ACTIVE${shared ? " — sentinel is also the sender mailbox, so layers assigned to it route to paper" : ""}`);
} else {
  console.log("  INFO  manual-paper routing off");
}

console.log(`\n${failures} failed · ${warnings} warnings\n`);
process.exit(failures > 0 ? 1 : 0);
