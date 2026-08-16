import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryMasterFormBySlug, queryWebFormVersion, getListColumnChoices, getListColumnValues } from "./_utils/graphClient.js";
import { logError } from "./_utils/logger.js";

// Minimal Vercel request/response types
interface ApiRequest {
  query: Record<string, string | string[]>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

const DEFAULT_PUBLISH_KEY = "production";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9_\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizePublishKey(value?: string): string {
  return slugify(value || DEFAULT_PUBLISH_KEY) || DEFAULT_PUBLISH_KEY;
}

function isExpired(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && Date.parse(value) <= Date.now();
}

/**
 * Walk survey JSON elements and resolve SharePoint-sourced choices via Graph API.
 * Mutates `surveyJson` in place — populates `choices` arrays from `spChoicesSource`
 * and `spFilteredListSource` references.
 * Returns a diagnostic summary of what was resolved.
 */
async function enrichSurveyJson(
  token: string,
  surveyJson: Record<string, unknown>
): Promise<{ spSources: number; choicesFetched: number; errors: string[] }> {
  const pages = (surveyJson.pages || []) as { elements?: Record<string, unknown>[] }[];
  const errors: string[] = [];
  let spSources = 0;
  let choicesFetched = 0;

  async function walk(elements: Record<string, unknown>[]) {
    const pending: Promise<void>[] = [];

    for (const el of elements) {
      if (el.type === "panel" && Array.isArray(el.elements)) {
        await walk(el.elements as Record<string, unknown>[]);
        continue;
      }

      // Main field spChoicesSource
      const src = el.spChoicesSource as
        | { list?: string; column?: string }
        | undefined;
      if (src?.list && src?.column) {
        spSources++;
        pending.push(
          getListColumnChoices(token, src.list, src.column)
            .then((choices) => {
              if (choices.length > 0) {
                el.choices = choices;
                choicesFetched++;
              }
            })
            .catch((e: unknown) => {
              errors.push(`spChoicesSource ${src.list}.${src.column}: ${e instanceof Error ? e.message : String(e)}`);
            })
        );
      }

      // Main field spFilteredListSource
      const fls = el.spFilteredListSource as
        | {
            list?: string;
            valueColumn?: string;
            labelColumn?: string;
            filterColumn?: string;
            filterValue?: string;
          }
        | undefined;
      if (fls?.list && fls?.valueColumn) {
        spSources++;
        pending.push(
          getListColumnValues(
            token,
            fls.list,
            fls.valueColumn,
            fls.filterColumn,
            fls.filterValue,
            fls.labelColumn
          )
            .then((choices) => {
              if (choices.length > 0) {
                el.choices = choices;
                choicesFetched++;
              }
            })
            .catch((e: unknown) => {
              errors.push(`spFilteredListSource ${fls.list}.${fls.valueColumn}: ${e instanceof Error ? e.message : String(e)}`);
            })
        );
      }

      // Matrix column choicesSource / filteredListSource
      if (
        (el.type === "matrixdynamic" || el.type === "dynamicmatrix") &&
        Array.isArray(el.columns)
      ) {
        const cols = el.columns as Record<string, unknown>[];
        for (const col of cols) {
          const colSrc = col.choicesSource as
            | { list?: string; column?: string }
            | undefined;
          if (colSrc?.list && colSrc?.column) {
            spSources++;
            pending.push(
              getListColumnChoices(token, colSrc.list, colSrc.column)
                .then((choices) => {
                  if (choices.length > 0) { col.choices = choices; choicesFetched++; }
                })
                .catch((e: unknown) => {
                  errors.push(`matrix.choicesSource ${colSrc.list}.${colSrc.column}: ${e instanceof Error ? e.message : String(e)}`);
                })
            );
          }
          const colFls = col.filteredListSource as
            | {
                list?: string;
                valueColumn?: string;
                labelColumn?: string;
                filterColumn?: string;
                filterValue?: string;
              }
            | undefined;
          if (colFls?.list && colFls?.valueColumn) {
            spSources++;
            pending.push(
              getListColumnValues(
                token,
                colFls.list,
                colFls.valueColumn,
                colFls.filterColumn,
                colFls.filterValue,
                colFls.labelColumn
              )
                .then((choices) => {
                  if (choices.length > 0) { col.choices = choices; choicesFetched++; }
                })
                .catch((e: unknown) => {
                  errors.push(`matrix.filteredListSource ${colFls.list}.${colFls.valueColumn}: ${e instanceof Error ? e.message : String(e)}`);
                })
            );
          }
        }
      }
    }

    await Promise.all(pending);
  }

  for (const page of pages) {
    if (Array.isArray(page.elements)) await walk(page.elements);
  }

  return { spSources, choicesFetched, errors };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  const pinVersion = req.query.version as string | undefined;
  const requestedPublishKey = (req.query.publish || req.query.batch) as string | undefined;
  if (!slug) return res.status(400).json({ error: "Missing slug parameter" });

  // Errors must never reach the edge cache: a single transient Graph failure would
  // otherwise be replayed to every visitor on this link for up to 5 more minutes.
  // The success path re-sets this header just before responding.
  res.setHeader("Cache-Control", "no-store");

  try {
    const token = await getGraphToken();

    // 1. Get form config from Master Form
    const formConfig = (await queryMasterFormBySlug(token, slug))?.fields;

    if (!formConfig) {
      return res.status(404).json({ error: `Form "${slug}" not found.` });
    }
    if (formConfig.IsPublished !== true) {
      return res.status(403).json({ error: "Form is not published." });
    }

    // 2. Get version data from Web Form Versions
    const targetVersion = pinVersion || (formConfig.CurrentVersion as string) || "1.0";
    const targetPublishKey = normalizePublishKey(requestedPublishKey || (formConfig.CurrentPublishKey as string | undefined));
    const row = (await queryWebFormVersion(token, String(formConfig.Title || ""), targetVersion, targetPublishKey))?.fields;

    if (!row && (pinVersion || requestedPublishKey)) {
      return res.status(404).json({ error: `Published form ${targetVersion}/${targetPublishKey} not found.` });
    }
    if (row?.PublishStatus === "off") {
      return res.status(403).json({ error: "This published form profile is turned off." });
    }
    if (isExpired(row?.PublishExpiresAt)) {
      return res.status(403).json({ error: "This published form profile has expired." });
    }

    let surveyJson: unknown = null;
    let meta: Record<string, unknown> = {};
    let versionLayerConfig: unknown = null;
    let publishLabel = String(formConfig.CurrentPublishLabel || "Production");
    if (row?.SurveyJSON) {
      try {
        const parsed = JSON.parse(row.SurveyJSON as string) as {
          surveyJson?: unknown;
          meta?: Record<string, unknown>;
          layerConfig?: unknown;
          publishLabel?: string;
        };
        surveyJson = parsed.surveyJson || null;
        meta = parsed.meta || {};
        versionLayerConfig = parsed.layerConfig || null;
        publishLabel = parsed.publishLabel || publishLabel;
      } catch {
        // Invalid JSON, leave as defaults
      }
    }

    // Without survey content the client has nothing to render or submit, so fail
    // loudly here rather than returning a 200 the form page cannot use.
    if (!surveyJson) {
      return res.status(404).json({
        error: `No published content found for ${targetVersion}/${targetPublishKey}. Please republish the form.`,
      });
    }

    // Enrich surveyJson with SP-sourced choices (using system credential)
    const enrichment = surveyJson && typeof surveyJson === "object" && (surveyJson as Record<string, unknown>).pages
      ? await enrichSurveyJson(token, surveyJson as Record<string, unknown>)
      : { spSources: 0, choicesFetched: 0, errors: ["No surveyJson.pages found"] };

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      formConfig: {
        ...formConfig,
        CurrentVersion: targetVersion,
        CurrentPublishKey: targetPublishKey,
        CurrentPublishLabel: publishLabel,
        LayerConfig: versionLayerConfig ? JSON.stringify(versionLayerConfig) : formConfig.LayerConfig,
      },
      surveyJson,
      meta,
      _enrichment: enrichment,
    });
  } catch (err) {
    logError("api:form-config", "Failed to load form configuration", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}
