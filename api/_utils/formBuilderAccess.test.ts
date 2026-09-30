import { describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({ logWarn: vi.fn(), logError: vi.fn() }));

import { formBuilderGroupName, resolveFormBuilder, type DelegatedGet } from "./formBuilderAccess.js";

/**
 * Only a form builder may mint a test ticket. The server must agree with the
 * browser's `resolveFormBuilderAccess` about who that is, and deny on every
 * failure.
 */

function getter(currentUser: Record<string, string>, members: Record<string, string>[] | Error): DelegatedGet {
  return (async (_token: string, path: string) => {
    if (path.startsWith("/_api/web/currentuser")) return currentUser;
    if (members instanceof Error) throw members;
    return { value: members };
  }) as DelegatedGet;
}

const ME = { Email: "Aina@pmw-group.com", LoginName: "i:0#.f|membership|aina.b@pmw-group.com" };

describe("which group decides", () => {
  it("uses the form builder group when one is configured", () => {
    expect(formBuilderGroupName({ VITE_OSHES_FORM_BUILDER_GROUP: "OSHES Authors", VITE_OSHES_ADMIN_GROUP: "OSHES Admins" })).toBe("OSHES Authors");
    expect(formBuilderGroupName({ OSHES_FORM_BUILDER_GROUP: "Server Authors" })).toBe("Server Authors");
  });

  it("falls back to the admin group, as the browser does", () => {
    expect(formBuilderGroupName({ VITE_OSHES_ADMIN_GROUP: "OSHES Admins" })).toBe("OSHES Admins");
  });

  it("is blank when nothing is configured", () => {
    expect(formBuilderGroupName({})).toBe("");
  });
});

describe("resolveFormBuilder", () => {
  it("answers with the sign-in name for a member, which is what SubmittedBy records", async () => {
    const who = await resolveFormBuilder("tok", {
      group: "OSHES Authors",
      get: getter(ME, [{ LoginName: "i:0#.f|membership|aina.b@pmw-group.com" }]),
    });
    expect(who).toBe("aina.b@pmw-group.com");
  });

  it("recognises a member listed only by mailbox", async () => {
    const who = await resolveFormBuilder("tok", { group: "OSHES Authors", get: getter(ME, [{ Email: "aina@pmw-group.com" }]) });
    expect(who).toBe("aina.b@pmw-group.com");
  });

  it("denies a non-member", async () => {
    expect(await resolveFormBuilder("tok", { group: "OSHES Authors", get: getter(ME, [{ Email: "someone@pmw-group.com" }]) })).toBeNull();
  });

  it("denies when no group is configured, rather than letting everyone in", async () => {
    expect(await resolveFormBuilder("tok", { group: "", get: getter(ME, [{ Email: "aina@pmw-group.com" }]) })).toBeNull();
  });

  it("denies when the group cannot be read", async () => {
    expect(await resolveFormBuilder("tok", { group: "Missing", get: getter(ME, new Error("SharePoint GET 404")) })).toBeNull();
  });

  it("denies an empty token without asking SharePoint", async () => {
    const get = vi.fn();
    expect(await resolveFormBuilder("  ", { group: "OSHES Authors", get: get as unknown as DelegatedGet })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
