import { describe, expect, it, vi } from "vitest";
import { SmokingApiError } from "./api";
import { checkPoster } from "./poster";

describe("checkPoster", () => {
  it("opens an active area under its name", async () => {
    const call = vi.fn().mockResolvedValue({ name: "Block A Rear", active: true });
    await expect(checkPoster("aaa111", call)).resolves.toEqual({ kind: "open", name: "Block A Rear" });
    expect(call).toHaveBeenCalledWith("area", { code: "aaa111" });
  });

  it("calls a switched-off area retired", async () => {
    const call = vi.fn().mockResolvedValue({ name: "Old Canteen", active: false });
    await expect(checkPoster("OLD001", call)).resolves.toEqual({ kind: "retired" });
  });

  it("calls a code no area answers to retired", async () => {
    const call = vi.fn().mockRejectedValue(new SmokingApiError("unknown-area", 404, "unknown-area"));
    await expect(checkPoster("NOPE00", call)).resolves.toEqual({ kind: "retired" });
  });

  it("passes a lost connection on, rather than blaming the poster", async () => {
    const offline = new SmokingApiError("Not recorded — no connection. Tap to try again.", 0, "network");
    const call = vi.fn().mockRejectedValue(offline);
    await expect(checkPoster("AAA111", call)).rejects.toBe(offline);
  });
});
