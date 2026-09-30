import { describe, expect, it } from "vitest";
import {
  signOffLabel,
  signOffName,
  signOffPosition,
  signOffVerdictForLayer,
  signOffVerdictFromStatus,
} from "./signOff";

describe("signOffVerdictFromStatus", () => {
  it("names the decision a layer status records", () => {
    expect(signOffVerdictFromStatus("Approved")).toBe("approved");
    expect(signOffVerdictFromStatus("Confirmed")).toBe("evaluated");
    expect(signOffVerdictFromStatus(" rejected ")).toBe("rejected");
  });

  it("finds no signer on a layer nobody at that layer decided", () => {
    expect(signOffVerdictFromStatus("Pending")).toBeNull();
    expect(signOffVerdictFromStatus("Rejected at Layer 2")).toBeNull();
    expect(signOffVerdictFromStatus("Manual Approved")).toBeNull();
    expect(signOffVerdictFromStatus(null)).toBeNull();
  });
});

describe("signOffLabel", () => {
  it("follows the layer type", () => {
    expect(signOffLabel(signOffVerdictForLayer("approval"))).toBe("Approved By");
    expect(signOffLabel(signOffVerdictForLayer("evaluation"))).toBe("Evaluated By");
    expect(signOffLabel(signOffVerdictForLayer("approval", true))).toBe("Rejected By");
  });

  it("lets a layer's own caption win, except over a rejection", () => {
    expect(signOffLabel("approved", "Endorsed By")).toBe("Endorsed By");
    expect(signOffLabel("rejected", "Endorsed By")).toBe("Rejected By");
    expect(signOffLabel("evaluated", "  ")).toBe("Evaluated By");
  });
});

describe("signOffName", () => {
  it("prefers the name stamped at signing", () => {
    expect(signOffName("Ahmad Faiz bin Rahman", "ahmad.faiz@pmw.com")).toBe("Ahmad Faiz bin Rahman");
  });

  it("falls back to the name the address spells out", () => {
    expect(signOffName("", "nurul.aisyah@pmw.com")).toBe("Nurul Aisyah");
  });

  it("names nobody for the public path's placeholder actor", () => {
    expect(signOffName(null, "SYSTEM")).toBe("");
  });
});

describe("signOffPosition", () => {
  it("prints the stamped position, else the layer title", () => {
    expect(signOffPosition("Head of Department", "HOD Approval")).toBe("Head of Department");
    expect(signOffPosition("", "HOD Approval")).toBe("HOD Approval");
    expect(signOffPosition(undefined, undefined)).toBe("");
  });
});
