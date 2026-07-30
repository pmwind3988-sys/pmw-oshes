/**
 * Simple API key authentication for Vercel serverless functions.
 * 
 * The frontend sends `X-Api-Key` header matching the `API_SECRET_KEY` env var.
 * This prevents unauthenticated callers from hitting your API endpoints.
 */

const API_SECRET = process.env.API_SECRET_KEY || "";

export function validateApiKey(headers: Record<string, string | string[] | undefined>): { valid: boolean; reason?: string } {
  if (!API_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return { valid: false, reason: "API key is not configured" };
    }
    return { valid: true };
  }

  const apiKey = typeof headers["x-api-key"] === "string"
    ? headers["x-api-key"]
    : Array.isArray(headers["x-api-key"])
      ? headers["x-api-key"][0]
      : "";

  if (!apiKey) {
    return { valid: false, reason: "Missing X-Api-Key header" };
  }

  if (apiKey !== API_SECRET) {
    return { valid: false, reason: "Invalid API key" };
  }

  return { valid: true };
}

/**
 * Set CORS headers on the response.
 * Uses the specific origin from vercel.json CORS config.
 */
export function setCorsHeaders(res: { setHeader: (name: string, value: string) => void }): void {
  res.setHeader("Access-Control-Allow-Origin", process.env.APP_ORIGIN || process.env.VITE_APP_BASE_URL || "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key");
}
