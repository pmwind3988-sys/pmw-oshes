import { describe, expect, it } from "vitest";
import { posterHtml, qrFileName, smokingScanUrl } from "./printSmokingPoster";
import type { SmokingArea } from "../../utils/smoking/schema";

describe("smoking poster", () => {
  it("points the QR at the area's scan page", () => {
    expect(smokingScanUrl("https://oshes.pmw-group.com/", "AAA111")).toBe("https://oshes.pmw-group.com/smoke?area=AAA111");
  });

  it("prints the area name, the instruction and the QR, escaping the name", () => {
    const html = posterHtml("Block <A>", "data:image/png;base64,xx", "https://x/smoke?area=AAA111");
    expect(html).toContain("Block &lt;A&gt;");
    expect(html).toContain("Scan when you arrive, scan again when you leave");
    expect(html).toContain('src="data:image/png;base64,xx"');
    expect(html).toContain("@page { size: A4");
  });
});

describe("qrFileName", () => {
  it("slugs the area name and appends the code", () => {
    const area: SmokingArea = { id: "1", code: "AAA111", name: "Block A smoking area", active: true };
    expect(qrFileName(area)).toBe("smoking-qr-block-a-smoking-area-AAA111.png");
  });

  it("collapses non-alphanumeric runs and trims leading/trailing dashes", () => {
    const area: SmokingArea = { id: "2", code: "B2", name: "  Loading Bay #2 / West!!  ", active: true };
    expect(qrFileName(area)).toBe("smoking-qr-loading-bay-2-west-B2.png");
  });
});
