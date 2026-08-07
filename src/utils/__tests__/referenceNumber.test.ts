import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFERENCE_CONFIG,
  formatReferenceNumber,
  malaysiaDateKey,
  normalizeReferencePrefix,
  parseReferenceNumberConfig,
  previewReferenceNumber,
  referenceCounterKey,
  serializeReferenceNumberConfig,
} from "../referenceNumber";

describe("malaysiaDateKey", () => {
  it("formats the Malaysian calendar day as DDMMYY", () => {
    // 2026-08-04T02:00:00Z = 10:00 on 4 Aug in Malaysia.
    expect(malaysiaDateKey(new Date("2026-08-04T02:00:00.000Z"))).toBe("040826");
  });

  it("still reports the previous day just before midnight MYT", () => {
    // 15:59 UTC = 23:59 MYT on the 4th.
    expect(malaysiaDateKey(new Date("2026-08-04T15:59:59.999Z"))).toBe("040826");
  });

  it("rolls over at midnight MYT, not at midnight UTC", () => {
    // 16:00 UTC = 00:00 MYT on the 5th.
    expect(malaysiaDateKey(new Date("2026-08-04T16:00:00.000Z"))).toBe("050826");
    // Midnight UTC is still the same Malaysian day, so the key must not change.
    expect(malaysiaDateKey(new Date("2026-08-04T23:59:00.000Z"))).toBe("050826");
    expect(malaysiaDateKey(new Date("2026-08-05T00:00:00.000Z"))).toBe("050826");
  });

  it("carries the month and year across a Malaysian day boundary", () => {
    // 31 Dec 2026 16:00 UTC = 1 Jan 2027 00:00 MYT.
    expect(malaysiaDateKey(new Date("2026-12-31T15:59:00.000Z"))).toBe("311226");
    expect(malaysiaDateKey(new Date("2026-12-31T16:00:00.000Z"))).toBe("010127");
  });

  it("zero-pads single-digit days and months", () => {
    expect(malaysiaDateKey(new Date("2026-01-02T04:00:00.000Z"))).toBe("020126");
  });
});

describe("formatReferenceNumber", () => {
  it("pads the sequence to the configured width", () => {
    expect(formatReferenceNumber("040826", 1, { prefix: "", pad: 4 })).toBe("040826-0001");
    expect(formatReferenceNumber("040826", 12, { prefix: "", pad: 4 })).toBe("040826-0012");
  });

  it("prepends a prefix when one is configured", () => {
    expect(formatReferenceNumber("040826", 3, { prefix: "OSH", pad: 4 })).toBe("OSH-040826-0003");
  });

  it("renders a sequence wider than the padding in full rather than truncating", () => {
    expect(formatReferenceNumber("040826", 10000, { prefix: "", pad: 4 })).toBe("040826-10000");
  });

  it("clamps the padding to a sane range", () => {
    expect(formatReferenceNumber("040826", 1, { prefix: "", pad: 0 })).toBe("040826-001");
    expect(formatReferenceNumber("040826", 1, { prefix: "", pad: 99 })).toBe("040826-00000001");
  });
});

describe("normalizeReferencePrefix", () => {
  it("uppercases and strips characters that would not survive a URL or filename", () => {
    expect(normalizeReferencePrefix("osh es/2")).toBe("OSHES2");
  });

  it("caps the length", () => {
    expect(normalizeReferencePrefix("ABCDEFGHIJKLMNOP")).toBe("ABCDEFGHIJKL");
  });

  it("returns an empty string for non-string input", () => {
    expect(normalizeReferencePrefix(undefined)).toBe("");
    expect(normalizeReferencePrefix(42)).toBe("");
  });
});

describe("parseReferenceNumberConfig", () => {
  it("returns defaults for absent, blank or malformed config", () => {
    expect(parseReferenceNumberConfig(undefined)).toEqual(DEFAULT_REFERENCE_CONFIG);
    expect(parseReferenceNumberConfig("")).toEqual(DEFAULT_REFERENCE_CONFIG);
    expect(parseReferenceNumberConfig("{not json")).toEqual(DEFAULT_REFERENCE_CONFIG);
    expect(parseReferenceNumberConfig("[]")).toEqual(DEFAULT_REFERENCE_CONFIG);
  });

  it("parses a stored JSON string", () => {
    expect(parseReferenceNumberConfig('{"enabled":true,"prefix":"osh","pad":5}')).toEqual({
      enabled: true,
      prefix: "OSH",
      pad: 5,
    });
  });

  it("treats anything other than boolean true as disabled", () => {
    expect(parseReferenceNumberConfig('{"enabled":"true"}').enabled).toBe(false);
  });

  it("round-trips through serialize", () => {
    const config = { enabled: true, prefix: "INC", pad: 4 };
    expect(parseReferenceNumberConfig(serializeReferenceNumberConfig(config))).toEqual(config);
  });
});

describe("previewReferenceNumber", () => {
  it("shows the first reference of the day", () => {
    expect(
      previewReferenceNumber({ enabled: true, prefix: "OSH", pad: 4 }, new Date("2026-08-04T02:00:00.000Z")),
    ).toBe("OSH-040826-0001");
  });
});

describe("referenceCounterKey", () => {
  it("is stable across casing and surrounding whitespace in the form title", () => {
    expect(referenceCounterKey("  Incident Report ", "040826")).toBe(referenceCounterKey("incident report", "040826"));
  });

  it("separates forms and days", () => {
    expect(referenceCounterKey("Incident Report", "040826")).not.toBe(
      referenceCounterKey("Incident Report", "050826"),
    );
    expect(referenceCounterKey("Incident Report", "040826")).not.toBe(
      referenceCounterKey("Inspection Checklist", "040826"),
    );
  });
});
