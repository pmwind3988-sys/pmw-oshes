import { describe, expect, it } from "vitest";
import { __test__ } from "./generateFormPdf";

describe("PDF image hydration", () => {
  it("recognizes SharePoint image URLs even when the download URL has no file extension", () => {
    expect(__test__.imageSourceFromString(
      "https://tenant.sharepoint.com/sites/hr/_layouts/15/download.aspx?UniqueId=abc",
      "https://tenant.sharepoint.com/sites/hr",
    )).toBe("https://tenant.sharepoint.com/sites/hr/_layouts/15/download.aspx?UniqueId=abc");
  });

  it("recognizes SharePoint URL field JSON values", () => {
    expect(__test__.imageSourceFromString(
      JSON.stringify({ Url: "/sites/hr/Signature%20Images/signed.png", Description: "Signature" }),
      "https://tenant.sharepoint.com/sites/hr",
    )).toBe("/sites/hr/Signature%20Images/signed.png");
  });
});
