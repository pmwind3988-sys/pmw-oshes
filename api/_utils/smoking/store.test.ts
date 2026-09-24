import { describe, expect, it } from "vitest";
import { toArea, toBreak, toProfile } from "./store.js";

describe("store mapping", () => {
  it("reads an open break with no time out", () => {
    const row = toBreak({ id: "3", fields: { Email: "ali@gmail.com", TimeIn: "2026-09-24T02:42:00Z", DurationMinutes: null } });
    expect(row).toMatchObject({ id: "3", email: "ali@gmail.com", timeOut: null, durationMinutes: null, flagReason: "" });
  });

  it("reads a closed break's duration as a number", () => {
    expect(toBreak({ id: "4", fields: { TimeOut: "2026-09-24T02:49:00Z", DurationMinutes: "7" } }).durationMinutes).toBe(7);
  });

  it("treats an area as active unless marked no", () => {
    expect(toArea({ id: "1", fields: { Title: "Block A", Code: "A1B2C3" } }).active).toBe(true);
    expect(toArea({ id: "1", fields: { Title: "Block A", Code: "A1B2C3", Active: "no" } }).active).toBe(false);
  });

  it("remembers a typed-in department", () => {
    expect(toProfile({ id: "9", fields: { Email: "a@b.com", DepartmentFromList: "no" } }).departmentFromList).toBe(false);
  });

  it("reads a blocked profile", () => {
    expect(toProfile({ id: "9", fields: { Email: "a@b.com", Blocked: "yes" } }).blocked).toBe(true);
  });

  it("treats a profile as not blocked unless marked yes", () => {
    expect(toProfile({ id: "9", fields: { Email: "a@b.com" } }).blocked).toBe(false);
  });
});
