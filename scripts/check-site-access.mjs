#!/usr/bin/env node
/**
 * Live check: can the server-side app actually reach the SharePoint site?
 *
 * `check-env.mjs` proves the variables are present and consistent. This proves
 * the tenant agrees. The two failures it separates look identical from the app —
 * every API route returns 500 — but have opposite fixes:
 *
 *   - token acquired, roles include Sites.Selected, site GET 403
 *       -> the per-site grant was never made. See SETUP.md step B5.
 *   - token acquired, roles include Sites.ReadWrite.All, site GET 403
 *       -> the site URL is wrong, or the site does not exist.
 *
 * Sites.Selected grants nothing until an administrator grants it on the specific
 * site, so a correctly configured app registration reads as "denied" on a new
 * site until that one step is done.
 *
 * Never prints a secret or a token.
 *
 *   node scripts/check-site-access.mjs [path-to-env-file]   (default: .env.local)
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

const tenantId = env.VITE_AZURE_TENANT_ID || env.AZURE_TENANT_ID;
const clientId = env.SYSTEM_CLIENT_ID || env.VITE_AZURE_CLIENT_ID;
const clientSecret = env.SYSTEM_CLIENT_SECRET || env.VITE_AZURE_CLIENT_SECRET;
const siteUrl = (env.VITE_SP_SITE_URL || env.SP_SITE_URL || "").replace(/\/$/, "");

for (const [name, value] of [
  ["VITE_AZURE_TENANT_ID", tenantId],
  ["SYSTEM_CLIENT_ID", clientId],
  ["SYSTEM_CLIENT_SECRET", clientSecret],
  ["VITE_SP_SITE_URL", siteUrl],
]) {
  if (!value) {
    console.error(`  FAIL  ${name} is not set in ${file} — nothing to test`);
    process.exit(2);
  }
}

let site;
try {
  site = new URL(siteUrl);
} catch {
  console.error(`  FAIL  VITE_SP_SITE_URL is not a valid URL: ${siteUrl}`);
  process.exit(2);
}

console.log(`\n${file}`);
console.log(`  app  ${clientId}`);
console.log(`  site ${siteUrl}\n`);

// --- Token ---

const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  }).toString(),
});

if (!tokenRes.ok) {
  const text = await tokenRes.text();
  // AADSTS codes are diagnostic, not secret. The response carries no token.
  console.log(`  FAIL  token acquisition ${tokenRes.status}`);
  console.log(`        ${(text.match(/AADSTS\d+: [^.\r\n]+/) || [text.slice(0, 200)])[0]}`);
  console.log("\n  Wrong tenant, wrong client id, or an expired client secret.\n");
  process.exit(1);
}

const { access_token: token } = await tokenRes.json();
const claims = JSON.parse(
  Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
);
const roles = claims.roles || [];

console.log("  PASS  token acquired");
console.log(`  INFO  app-only roles: ${roles.length ? roles.join(", ") : "(none)"}`);

const selectedOnly = roles.includes("Sites.Selected") &&
  !roles.some((r) => /^Sites\.(Read|ReadWrite|Manage|FullControl)\.All$/.test(r));

// --- Site ---

const sitePath = `/sites/${site.hostname}:${site.pathname}`;
const siteRes = await fetch(`https://graph.microsoft.com/v1.0${sitePath}`, {
  headers: { Authorization: `Bearer ${token}` },
});

if (siteRes.ok) {
  const data = await siteRes.json();
  console.log(`  PASS  site readable — ${data.displayName || data.name}`);
  console.log(`  INFO  site id ${data.id}`);

  const listsRes = await fetch(
    `https://graph.microsoft.com/v1.0${sitePath}:/lists?$select=displayName&$top=200`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (listsRes.ok) {
    const lists = (await listsRes.json()).value || [];
    console.log(`  PASS  ${lists.length} lists readable`);
  } else {
    console.log(`  FAIL  lists ${listsRes.status} — the site grant may be narrower than the site itself`);
    process.exit(1);
  }

  console.log("\n  Server-side Graph access is working.\n");
  process.exit(0);
}

const body = await siteRes.text();
const code = (body.match(/"code"\s*:\s*"([^"]+)"/) || [, "unknown"])[1];
console.log(`  FAIL  site GET ${siteRes.status} ${code}`);

if (siteRes.status === 403 && selectedOnly) {
  console.log(`
  The app holds Sites.Selected and nothing broader, so it can only reach sites
  it has been granted individually. This site has no grant.

  An administrator must run, once, against the site id for ${siteUrl}:

    az rest --method POST \\
      --url "https://graph.microsoft.com/v1.0/sites/{site-id}/permissions" \\
      --body '{"roles":["write"],"grantedToIdentities":[{"application":{"id":"${clientId}","displayName":"PMW Forms"}}]}'

  Full walkthrough in SETUP.md, step B5. No redeploy is needed afterwards.
`);
} else if (siteRes.status === 403) {
  console.log(`
  The app holds a tenant-wide Sites role, so a denial here points at the site
  rather than the grant. Check VITE_SP_SITE_URL names a site that exists.
`);
} else if (siteRes.status === 404) {
  console.log(`
  No such site. Check the /sites/<name> segment of VITE_SP_SITE_URL — it must be
  the URL segment, which is not always the display name shown in SharePoint.
`);
}

process.exit(1);
