import { describe, expect, it } from "vitest";

import {
  isReissueAllowed,
  linkTokenField,
  mintLinkToken,
  parseLinkReissueLog,
  readLinkToken,
  recordReissue,
} from "./linkToken.js";

describe("link token storage", () => {
  it("names a column per layer, so finishing one does not open the next", () => {
    expect(linkTokenField(1)).toBe("L1_LinkToken");
    expect(linkTokenField(4)).toBe("L4_LinkToken");
  });

  it("mints a fresh value each time", () => {
    expect(mintLinkToken()).not.toBe(mintLinkToken());
    expect(mintLinkToken()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reads a submission that predates bindings as holding none", () => {
    expect(readLinkToken({}, 2)).toBe("");
    expect(readLinkToken({ L2_LinkToken: "   " }, 2)).toBe("");
    expect(readLinkToken(undefined, 2)).toBe("");
    expect(readLinkToken({ L2_LinkToken: "tok-9f2" }, 2)).toBe("tok-9f2");
  });
});

describe("replacement-link throttle", () => {
  const now = new Date("2026-09-01T12:00:00Z");

  it("allows the first replacement for a layer", () => {
    expect(isReissueAllowed("", 2, now)).toBe(true);
    expect(isReissueAllowed(null, 2, now)).toBe(true);
    expect(isReissueAllowed("not json", 2, now)).toBe(true);
  });

  it("refuses a second one straight away", () => {
    const log = recordReissue("", 2, new Date("2026-09-01T11:58:00Z"));
    expect(isReissueAllowed(log, 2, now)).toBe(false);
  });

  it("allows one again once the cooldown has passed", () => {
    const log = recordReissue("", 2, new Date("2026-09-01T11:40:00Z"));
    expect(isReissueAllowed(log, 2, now)).toBe(true);
  });

  it("throttles each layer on its own clock", () => {
    const log = recordReissue("", 2, new Date("2026-09-01T11:58:00Z"));
    expect(isReissueAllowed(log, 3, now)).toBe(true);
  });

  it("keeps the other layers' entries when recording one", () => {
    const first = recordReissue("", 2, new Date("2026-09-01T11:00:00Z"));
    const second = recordReissue(first, 3, now);
    expect(Object.keys(parseLinkReissueLog(second)).sort()).toEqual(["2", "3"]);
  });
});
