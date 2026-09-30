import { describe, expect, it } from "vitest";
import { approverDisplayName, nameFromEmail } from "./approverIdentity";

describe("approver identity", () => {
  it("reads a name out of a work address", () => {
    expect(nameFromEmail("ahmad.faiz@pmw.com.my")).toBe("Ahmad Faiz");
    expect(nameFromEmail("nurul_aisyah@pmw.com.my")).toBe("Nurul Aisyah");
    expect(nameFromEmail("sitiBinti.Rahman@pmw.com")).toBe("Siti binti Rahman");
    expect(nameFromEmail("ahmad.faiz2@pmw.com")).toBe("Ahmad Faiz");
  });

  // A login code is not a name, and printing "Hr01" under a signature would
  // put a person's identity on the record that no one can check.
  it("prints the address whole when there is no name in it", () => {
    expect(nameFromEmail("hr01@pmw.com")).toBe("hr01@pmw.com");
    expect(nameFromEmail("admin@pmw.com")).toBe("admin@pmw.com");
    expect(nameFromEmail("")).toBe("");
  });

  it("prefers the display name the sign-in returned", () => {
    expect(approverDisplayName("Nurul Aisyah binti Rahman", "hr01@pmw.com")).toBe("Nurul Aisyah binti Rahman");
    expect(approverDisplayName("  ", "ahmad.faiz@pmw.com")).toBe("Ahmad Faiz");
    expect(approverDisplayName("ahmad.faiz@pmw.com", "ahmad.faiz@pmw.com")).toBe("Ahmad Faiz");
  });
});
