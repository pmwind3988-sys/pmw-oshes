/**
 * Distribution-list expansion from the browser.
 *
 * Reading group membership needs an application-level Graph permission that the
 * browser's delegated token does not carry, so the expansion runs server-side.
 * The caller names a form + layer rather than an address: `api/expand-group.ts`
 * reads the address off that layer's published config, which keeps the route
 * from being a general membership lookup for anyone holding the client API key.
 */
import { parseValidEmailList } from "./layerRecipients";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

export async function expandLayerDistributionList(
  formSlug: string,
  layerNumber: number,
  branch?: string,
): Promise<string[]> {
  if (!formSlug.trim()) {
    throw new Error("A published form slug is needed to read the distribution list members.");
  }
  const response = await fetch(`${window.location.origin}/api/expand-group`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify({ slug: formSlug, layerNumber, ...(branch ? { branch } : {}) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not read the distribution list members.");
  }
  const payload = await response.json() as { members?: unknown };
  return parseValidEmailList(payload.members);
}
