/**
 * AI export polish.
 *
 * When enabled (personal builds only, owner-gated), PDF and Word exports ask
 * an OpenAI-compatible LLM to pick a polished layout for the report. For
 * Colour exports the model also picks a curated palette; for Plain exports
 * the palette is ignored and only font sizing, column widths, cell padding,
 * zebra shading, Total-row tint and border style are applied. The model's
 * answer arrives as a small JSON object that is strictly validated and clamped
 * here — an unreachable model, a timeout, or an unusable answer simply leaves
 * the standard look in place, so the AI can never break or empty an export.
 *
 * Excel exports never pass through the AI.
 *
 * Credentials come from the Settings screen (stored on this device) and, when
 * those fields are left blank, from build-time defaults in .env
 * (NEXT_PUBLIC_USER_LLM_*). The key is never shown anywhere except as the
 * user typed it in Settings.
 */

const ENV_BASE_URL = ((process.env.NEXT_PUBLIC_USER_LLM_BASE_URL ?? "").trim()).replace(/\/+$/, "");
const ENV_API_KEY = (process.env.NEXT_PUBLIC_USER_LLM_API_KEY ?? "").trim();
const ENV_MODEL = (process.env.NEXT_PUBLIC_USER_LLM_MODEL ?? "").trim();

/** Turning the feature ON asks for this password; turning it off does not. */
export const AI_EXPORT_PASSWORD = "25800852456@aA";

export const AI_KEYS = {
  enabled: "snt.aiExport.enabled",
  baseUrl: "snt.aiExport.baseUrl",
  apiKey: "snt.aiExport.apiKey",
  model: "snt.aiExport.model",
} as const;

export interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  hasCredential: boolean;
}

/** Settings-screen defaults (what the inputs fall back to when left blank). */
export function aiDefaults(): { baseUrl: string; model: string } {
  return { baseUrl: ENV_BASE_URL, model: ENV_MODEL };
}

export function loadAiConfig(): AiConfig {
  let enabled = false;
  let baseUrl = "";
  let apiKey = "";
  let model = "";
  try {
    enabled = localStorage.getItem(AI_KEYS.enabled) === "1";
    baseUrl = localStorage.getItem(AI_KEYS.baseUrl) ?? "";
    apiKey = localStorage.getItem(AI_KEYS.apiKey) ?? "";
    model = localStorage.getItem(AI_KEYS.model) ?? "";
  } catch {
    /* storage unavailable */
  }
  const resolvedApi = apiKey.trim() || ENV_API_KEY;
  const resolvedBase = (baseUrl.trim() || ENV_BASE_URL).replace(/\/+$/, "");
  const resolvedModel = model.trim() || ENV_MODEL;
  return {
    enabled,
    baseUrl: resolvedBase,
    apiKey: resolvedApi,
    model: resolvedModel,
    hasCredential: Boolean(resolvedBase && resolvedApi && resolvedModel),
  };
}

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

export type PaletteName =
  | "classic"
  | "navy"
  | "indigo"
  | "forest"
  | "teal"
  | "burgundy"
  | "slate"
  | "charcoal";

type Rgb = [number, number, number];

export interface PaletteColors {
  head: Rgb;
  headText: Rgb;
  ink: Rgb;
  accent: Rgb;
  zebra: Rgb;
  total: Rgb;
  line: Rgb;
  headHex: string;
  headTextHex: string;
  inkHex: string;
  accentHex: string;
  zebraHex: string;
  totalHex: string;
  lineHex: string;
}

const RAW_PALETTES: Record<PaletteName, Record<"head" | "headText" | "ink" | "accent" | "zebra" | "total" | "line", string>> = {
  classic: { head: "#DBEAFE", headText: "#1E3A8A", ink: "#1E3A8A", accent: "#055F46", zebra: "#F8FAFC", total: "#E0F2FE", line: "#CBD5E1" },
  navy: { head: "#172554", headText: "#FFFFFF", ink: "#172554", accent: "#047857", zebra: "#F1F5F9", total: "#E0E7FF", line: "#CBD5E1" },
  indigo: { head: "#3730A3", headText: "#FFFFFF", ink: "#312E81", accent: "#4338CA", zebra: "#EEF2FF", total: "#E0E7FF", line: "#C7D2FE" },
  forest: { head: "#065F46", headText: "#FFFFFF", ink: "#064E3B", accent: "#15803D", zebra: "#F0FDF4", total: "#DCFCE7", line: "#BBF7D0" },
  teal: { head: "#115E59", headText: "#FFFFFF", ink: "#134E4A", accent: "#0F766E", zebra: "#F0FDFA", total: "#CCFBF1", line: "#99F6E4" },
  burgundy: { head: "#7F1D1D", headText: "#FFFFFF", ink: "#7F1D1D", accent: "#9F1239", zebra: "#FEF2F2", total: "#FFE4E6", line: "#FECACA" },
  slate: { head: "#334155", headText: "#FFFFFF", ink: "#1E293B", accent: "#475569", zebra: "#F1F5F9", total: "#E2E8F0", line: "#CBD5E1" },
  charcoal: { head: "#111827", headText: "#FFFFFF", ink: "#111827", accent: "#374151", zebra: "#F3F4F6", total: "#E5E7EB", line: "#D1D5DB" },
};

export const PALETTE_NAMES = Object.keys(RAW_PALETTES) as PaletteName[];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const paletteCache = new Map<PaletteName, PaletteColors>();
export function paletteOf(name: PaletteName): PaletteColors {
  const hit = paletteCache.get(name);
  if (hit) return hit;
  const raw = RAW_PALETTES[name];
  const out: PaletteColors = {
    head: hexToRgb(raw.head),
    headText: hexToRgb(raw.headText),
    ink: hexToRgb(raw.ink),
    accent: hexToRgb(raw.accent),
    zebra: hexToRgb(raw.zebra),
    total: hexToRgb(raw.total),
    line: hexToRgb(raw.line),
    headHex: raw.head.replace("#", "").toUpperCase(),
    headTextHex: raw.headText.replace("#", "").toUpperCase(),
    inkHex: raw.ink.replace("#", "").toUpperCase(),
    accentHex: raw.accent.replace("#", "").toUpperCase(),
    zebraHex: raw.zebra.replace("#", "").toUpperCase(),
    totalHex: raw.total.replace("#", "").toUpperCase(),
    lineHex: raw.line.replace("#", "").toUpperCase(),
  };
  paletteCache.set(name, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* The validated polish the model may return                           */
/* ------------------------------------------------------------------ */

export interface ExportPolish {
  /** Palette name; null means "don't colour" (plain exports). */
  palette: PaletteName | null;
  zebra: boolean;
  highlightTotals: boolean;
  borders: "grid" | "none";
  /** 2..6 pt cell padding. */
  cellPadding?: number;
  /** Percent of printable width per column of the main table (sums to 100). */
  columnWidths?: number[];
  /** -2..+2 pt hint for the auto page-fit layouts. */
  fitFontNudge?: number;
}

/* ------------------------------------------------------------------ */
/* Report spec sent to the model                                       */
/* ------------------------------------------------------------------ */

export interface AiTableSpec {
  headers: string[];
  rowCount: number;
  /** Relative content width per column (0..1), from the widest cell text. */
  relWidths: number[];
}

export interface ReportSpec {
  title: string;
  kind: string;
  layout: "one-page" | "two-page" | "standard";
  format: "pdf" | "docx";
  /** true = plain (no colour) export; false = colour export. */
  isPlain: boolean;
  tables: AiTableSpec[];
}

/**
 * Compact, structural description of the report (no personal values beyond
 * headers and text lengths) — this is all the model receives.
 */
export function buildReportSpec(
  title: string,
  kind: string,
  layout: ReportSpec["layout"],
  format: ReportSpec["format"],
  bodyHtml: string,
  style: "plain" | "colour" = "colour"
): ReportSpec {
  const parsed = new DOMParser().parseFromString(`<div>${bodyHtml}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  const tables: AiTableSpec[] = [];
  if (root) {
    for (const tbl of Array.from(root.querySelectorAll("table")).slice(0, 2)) {
      const spec = tableSpec(tbl);
      if (spec) tables.push(spec);
    }
  }
  return { title, kind, layout, format, isPlain: style === "plain", tables };
}

function tableSpec(tbl: Element): AiTableSpec | null {
  const trs = Array.from(tbl.querySelectorAll("tr"));
  if (!trs.length) return null;
  let headCount = 0;
  while (headCount < trs.length && trs[headCount].querySelector("th")) headCount++;
  const active = new Map<number, number>();
  const headers: (string | undefined)[] = [];
  const colLen: number[] = [];
  let maxCol = 0;
  let rowCount = 0;
  for (const tr of trs) {
    const els = Array.from(tr.querySelectorAll("td, th"));
    const isHead = Boolean(tr.querySelector("th"));
    let col = 0;
    for (const el of els) {
      while (active.has(col)) {
        const left = (active.get(col) ?? 1) - 1;
        if (left <= 0) active.delete(col);
        else active.set(col, left);
        col++;
      }
      const colSpan = Math.max(1, parseInt(el.getAttribute("colspan") || "1", 10) || 1);
      const rowSpan = Math.max(1, parseInt(el.getAttribute("rowspan") || "1", 10) || 1);
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (isHead && !headers[col] && text) headers[col] = text.slice(0, 40);
      if (!isHead && text) colLen[col] = Math.max(colLen[col] ?? 0, Math.min(text.length, 60));
      if (rowSpan > 1) active.set(col, rowSpan > 1 ? rowSpan - 1 : 0);
      if (col + colSpan > maxCol) maxCol = col + colSpan;
      col += colSpan;
    }
    if (!isHead) rowCount++;
  }
  if (!maxCol) return null;
  const lens: number[] = [];
  for (let i = 0; i < maxCol; i++) lens.push(colLen[i] ?? 0);
  const top = Math.max(1, ...lens);
  const relWidths = lens.map((w) => Math.round((w / top) * 100) / 100);
  const headersOut: string[] = [];
  for (let i = 0; i < maxCol; i++) headersOut.push(headers[i] ?? "");
  return { headers: headersOut, rowCount, relWidths };
}

/* ------------------------------------------------------------------ */
/* Model call + validation                                             */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT =
  "You are the layout designer for railway maintenance reports rendered as strict grid tables in PDF and Word.\n" +
  "You receive a JSON spec of one report (headers, row count, each column's relative content width, and whether the export is colour or plain).\n" +
  "Choose a polished, professional look and return ONLY a JSON object with exactly these keys:\n" +
  '- "palette": one of "classic","navy","indigo","forest","teal","burgundy","slate","charcoal" for colour exports; omit or set to null for plain (no-colour) exports — the app ignores the palette in that case but still applies the other layout settings.\n' +
  '- "cellPadding": integer 2..6, points of cell padding suited to the row count density.\n' +
  '- "columnWidths": array of integers, percent of the page width, each 4..60, one entry per column of the FIRST table in "headers" order — wider for long text (nature of work, stations, remarks), narrow for codes and times.\n' +
  '- "zebra": boolean, shade alternate body rows for readability (always true for colour exports).\n' +
  '- "highlightTotals": boolean, tint closing Total / Grand Total rows.\n' +
  '- "borders": "grid" or "none" for the internal table rules.\n' +
  '- "fitFontNudge": integer -2..2, how many points to nudge the text size in the auto page-fit layouts.\n' +
  "Never change wording or data. Reply with the JSON object only, no prose.";

export async function requestAiPolish(
  spec: ReportSpec,
  cfg: AiConfig,
  timeoutMs = 20000
): Promise<{ polish: ExportPolish | null; error?: string }> {
  if (!cfg.hasCredential) return { polish: null, error: "No AI endpoint configured — standard look." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(spec) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let msg = `AI error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error?.message) msg = String(j.error.message);
      } catch {
        /* non-JSON error body */
      }
      return { polish: null, error: `${msg.slice(0, 160)} — standard look.` };
    }
    const j = await res.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "";
    const colCount = spec.tables[0]?.headers.length || 0;
    const polish = parsePolishResponse(content, colCount);
    return polish
      ? { polish }
      : { polish: null, error: "AI returned an unusable layout — standard look." };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      polish: null,
      error: aborted
        ? "The AI took too long — standard look."
        : "AI unreachable — standard look.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Quick probe used by the Settings "Test connection" button. */
export async function testAiConnection(cfg: AiConfig): Promise<{ ok: boolean; message: string }> {
  if (!cfg.hasCredential) return { ok: false, message: "Set the base URL, key and model first." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let msg = `AI error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error?.message) msg = String(j.error.message);
      } catch {
        /* non-JSON error body */
      }
      return { ok: false, message: msg.slice(0, 160) };
    }
    return { ok: true, message: `Connected — ${cfg.model} answered.` };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      message: aborted ? "The AI took too long to answer." : "The AI endpoint could not be reached.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface AiModelInfo {
  id: string;
}

/** Hardcoded fallback list — kept in sync with what router.bynara.id currently offers. */
const KNOWN_MODELS: AiModelInfo[] = [
  { id: "agnes-2.5-flash" },
  { id: "agnes-video-v2.0" },
  { id: "claude-fable-5" },
  { id: "claude-fable-5.1" },
  { id: "claude-opus-4.7" },
  { id: "claude-opus-4.8" },
  { id: "claude-opus-5" },
  { id: "claude-sonnet-5" },
  { id: "deepseek-v4-flash" },
  { id: "deepseek-v4-flash-alibaba" },
  { id: "deepseek-v4-flash-vision-exp" },
  { id: "deepseek-v4-pro" },
  { id: "deepseek-v4-pro-0813-bynara" },
  { id: "deepseek-v4-pro-alibaba" },
  { id: "gemini-3.8-flash-high" },
  { id: "glm-5.2" },
  { id: "glm-5.3" },
  { id: "glm-5.3-flash" },
  { id: "glm-5.3-free" },
  { id: "gpt-5.4" },
  { id: "gpt-5.5" },
  { id: "gpt-5.6-luna" },
  { id: "gpt-5.6-sol" },
  { id: "gpt-5.6-terra" },
  { id: "gpt-6-astra" },
  { id: "grok-4.6" },
  { id: "kimi-k2.7-code" },
  { id: "kimi-k3" },
  { id: "kimi-k3-promo" },
  { id: "laguna-s-2.1" },
  { id: "longcat-2.0-free" },
  { id: "mimo-v2.5" },
  { id: "mimo-v2.5-free" },
  { id: "mimo-v2.5-pro" },
  { id: "minimax-m3" },
  { id: "muse-spark-1.2" },
  { id: "muse-spark-1.2-contributor" },
  { id: "muse-spark-1.2-contributor-free" },
  { id: "muse-spark-1.3" },
  { id: "muse-spark-1.3-contributor" },
  { id: "muse-spark-1.3-contributor-free" },
  { id: "qwen3.7-flash" },
  { id: "qwen3.8-27b" },
  { id: "qwen3.8-flash" },
  { id: "qwen3.8-max" },
  { id: "qwen3.8-max-alibaba" },
  { id: "stepfun-3.7-flash" },
];

/** Fetches the list of available model IDs from the upstream router.
 *  Tries the in-app proxy route first (dev/preview); falls back to the
 *  built-in known-models list when running inside the offline APK. */
export async function listAiModels(cfg: AiConfig): Promise<{ models: AiModelInfo[]; error?: string }> {
  if (!cfg.hasCredential) return { models: KNOWN_MODELS, error: undefined };
  // Try the in-app proxy route (works in dev / preview server builds).
  try {
    const res = await fetch("/api/ai/models", {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const j = await res.json() as { data?: { id: string }[] };
      const models: AiModelInfo[] = (j.data ?? [])
        .map((m) => ({ id: String(m.id) }))
        .filter((m) => m.id.length > 0);
      if (models.length > 0) return { models };
    }
  } catch {
    /* proxy unavailable — fall through to known list */
  }
  // Direct fetch as a second attempt (may work if WebView CORS is relaxed).
  try {
    const res = await fetch(`${cfg.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const j = await res.json() as { data?: { id: string }[] };
      const models: AiModelInfo[] = (j.data ?? [])
        .map((m) => ({ id: String(m.id) }))
        .filter((m) => m.id.length > 0);
      if (models.length > 0) return { models };
    }
  } catch {
    /* direct fetch failed — fall through to known list */
  }
  return { models: KNOWN_MODELS };
}

/**
 * Strict gate on the model's reply: the palette name must be one of the
 * curated set and every number is clamped (or dropped). Anything malformed
 * yields null and the export keeps the standard look.
 */
export function parsePolishResponse(content: string, colCount: number): ExportPolish | null {
  try {
    let s = String(content ?? "").trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const raw = JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
    let palette: PaletteName | null = null;
    if (typeof raw.palette === "string" && (PALETTE_NAMES as string[]).includes(raw.palette)) {
      palette = raw.palette as PaletteName;
    }
    const out: ExportPolish = {
      palette,
      zebra: raw.zebra !== false,
      highlightTotals: raw.highlightTotals !== false,
      borders: raw.borders === "none" ? "none" : "grid",
    };
    if (typeof raw.cellPadding === "number" && Number.isInteger(raw.cellPadding) && raw.cellPadding >= 2 && raw.cellPadding <= 6) {
      out.cellPadding = raw.cellPadding;
    }
    if (typeof raw.fitFontNudge === "number" && Number.isFinite(raw.fitFontNudge)) {
      out.fitFontNudge = Math.max(-2, Math.min(2, Math.round(raw.fitFontNudge)));
    }
    if (
      Array.isArray(raw.columnWidths) &&
      colCount > 0 &&
      raw.columnWidths.length === colCount &&
      raw.columnWidths.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      let ws = (raw.columnWidths as number[]).map((v) => Math.max(4, Math.min(60, v)));
      const sum = ws.reduce((a, b) => a + b, 0);
      if (sum > 0) {
        ws = ws.map((v) => Math.round((v / sum) * 1000) / 10);
        const drift = Math.round((100 - ws.reduce((a, b) => a + b, 0)) * 10) / 10;
        if (drift !== 0) ws[ws.length - 1] = Math.round((ws[ws.length - 1] + drift) * 10) / 10;
      }
      out.columnWidths = ws;
    }
    return out;
  } catch {
    return null;
  }
}
