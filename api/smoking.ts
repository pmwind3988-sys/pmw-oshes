import { setCorsHeaders, validateApiKey } from "./_utils/auth.js";
import { getGraphToken, graphGet } from "./_utils/graphClient.js";
import { logError } from "./_utils/logger.js";
import { createDepartmentCache, departmentSourceFromEnv, departmentsPath, parseDepartments } from "./_utils/smoking/departments.js";
import { handleSmoking } from "./_utils/smoking/handler.js";
import { createCachedJwksFetcher, verifyGoogleIdToken, verifyMicrosoftIdToken } from "./_utils/smoking/idToken.js";
import { createGraphSmokingStore } from "./_utils/smoking/store.js";

interface ApiRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

const fetchJwks = createCachedJwksFetcher();
const departmentSource = departmentSourceFromEnv();
const departmentCache = createDepartmentCache(async () =>
  parseDepartments(await graphGet(await getGraphToken(), departmentsPath(departmentSource)), departmentSource.column));
const store = createGraphSmokingStore();

/**
 * Smoking log: sign-in, profile, departments, area lookup and scan — one
 * function so the deployment stays inside its function budget.
 * Logic lives in `_utils/smoking/handler.ts`, where it is tested.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });

  const passSecret = process.env.SMOKING_PASS_SECRET || "";
  const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
  const msClientId = process.env.VITE_AZURE_CLIENT_ID || "";
  const tenantId = process.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "";
  if (passSecret.length < 32 || !googleClientId) {
    logError("smoking", "SMOKING_PASS_SECRET (32+ chars) or GOOGLE_CLIENT_ID is not configured");
    return res.status(500).json({ error: "The smoking log is not set up yet. Tell OSHES." });
  }

  try {
    const result = await handleSmoking(req, {
      store,
      verifyGoogle: (idToken) => verifyGoogleIdToken(idToken, { clientId: googleClientId, fetchJwks }),
      verifyMicrosoft: (idToken) => verifyMicrosoftIdToken(idToken, { clientId: msClientId, tenantId, fetchJwks }),
      departments: () => departmentCache.get(),
      passSecret,
      now: () => new Date(),
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    logError("smoking", "Smoking request failed", error);
    return res.status(500).json({ error: "Not recorded. Try again in a moment." });
  }
}
