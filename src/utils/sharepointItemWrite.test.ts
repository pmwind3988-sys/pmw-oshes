import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";

/**
 * What a portal write actually puts on the wire.
 *
 * Every write from the portal — sign, return, nudge, reassign, withdraw, and
 * the audit row behind each of them — goes through `upsertListItem`. It used to
 * stamp each request with a *guessed* SharePoint entity type, derived from the
 * list's display title. SharePoint derives that name from the list's URL, which
 * is set when the list is created and survives every later rename, so on any
 * list whose title had drifted from its URL the guess named a type that does
 * not exist and every write to that one list came back a bare 400.
 *
 * These pin both halves of the repair: nothing guessed goes on the wire, and a
 * refusal arrives carrying SharePoint's own sentence instead of a status code.
 */

const SITE = "https://pmwgroupcom.sharepoint.com/sites/PMWOSHESWEB";

const fetchWithAuthRecovery = vi.fn();

vi.mock("./authRecovery", () => ({
  fetchWithAuthRecovery: (...args: unknown[]) => fetchWithAuthRecovery(...args),
  acquireAccessTokenSilentOrRedirect: async () => "token",
  notifyAuthRecoveryForResponse: () => {},
}));

const { createSpClient } = await import("./sharepointClient");

/** A list whose display title carries spaces — the case the derivation mangled. */
const LIST = "PERMIT TO WORK";

function client() {
  const accounts = [{ username: "sazali@marinekita.com" } as AccountInfo];
  return createSpClient({} as IPublicClientApplication, accounts, SITE);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Route by URL, the way the real endpoints divide up. `onMerge` answers the write. */
function route(onMerge: (body: Record<string, unknown>) => Response) {
  fetchWithAuthRecovery.mockImplementation(async (url: string, options: RequestInit = {}) => {
    const target = String(url);
    if (target.includes("/contextinfo")) return json({ FormDigestValue: "digest" });
    if (target.includes("/items(")) {
      return onMerge(JSON.parse(String(options.body)) as Record<string, unknown>);
    }
    // The existence probe `upsertListItem` runs before it decides update vs create.
    if (target.includes("/items")) return json({ value: [{ Id: 20 }] });
    throw new Error(`unexpected request: ${target}`);
  });
}

describe("upsertListItem", () => {
  beforeEach(() => {
    fetchWithAuthRecovery.mockReset();
  });

  it("sends only the fields — no guessed entity type", async () => {
    const seen: Record<string, unknown>[] = [];
    route((body) => {
      seen.push(body);
      return new Response(null, { status: 204 });
    });

    const result = await client().upsertListItem(LIST, "Id eq 20", { FormStatus: "Cancelled" });

    expect(result).toEqual({ updated: true, id: "20" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ FormStatus: "Cancelled" });
    // The specific thing that broke this list, named so it cannot come back.
    expect(seen[0]).not.toHaveProperty("__metadata");
    expect(JSON.stringify(seen[0])).not.toContain("_x0020_");
  });

  it("carries SharePoint's own reason out of a 400", async () => {
    route(() =>
      json(
        {
          "odata.error": {
            message: { lang: "en-US", value: "The specified value is not valid for the field FormStatus." },
          },
        },
        400,
      ),
    );

    await expect(client().upsertListItem(LIST, "Id eq 20", { FormStatus: "Cancelled" })).rejects.toThrow(
      /not valid for the field FormStatus/,
    );
  });

  it("names the list in the error, so a per-list failure reads as one", async () => {
    route(() => new Response("Access denied.", { status: 403 }));

    await expect(client().upsertListItem(LIST, "Id eq 20", { FormStatus: "Cancelled" })).rejects.toThrow(
      /PERMIT TO WORK/,
    );
  });
});
