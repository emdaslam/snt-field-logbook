/**
 * PCDO PDF parsing — pulls the works lists (Highlights, Signalling works,
 * Engineering works) out of an office-composed PCDO return (see `Pdf samples/`,
 * e.g. "PCDO APRIL-26.pdf") so the IC certificate's "Repairs done during the
 * Month" column can be fed from it, in ascending work-date order.
 *
 * The office PDFs are Word exports whose page geometry drives everything:
 * - text arrives as segments with (x, y); lines are y-clusters PER PAGE;
 * - the letter block and the Highlights list share page 1 as two visual
 *   columns, so their lines interleave in y order — acceptance rules below
 *   (indent anchoring + junk filters) keep one from bleeding into the other;
 * - station cells are table row-spans: the station token floats on its own
 *   centred line between its activity lines (or inline with one).
 *
 * ponytail: geometry-only heuristics, calibrated on the JMDG Jan–Apr 2026
 * samples; an exotic layout degrades to empty/unmatched output, never a
 * crash. Upgrade path if samples drift: lattice reconstruction from ruled
 * rectangles instead of column x-thresholds.
 */

export type PcdoItem = { text: string; dateIso: string | null };
export type PcdoStationWorks = { label: string; items: PcdoItem[] };
export type PcdoParseResult = {
  stations: PcdoStationWorks[];
  /** Highlight bullets that name no station (several stations in one line). */
  unattributed: PcdoItem[];
};

/** One positioned text run from pdf.js getTextContent(). */
export type PcdoSeg = { x: number; y: number; w: number; h: number; str: string };

const NUM_ITEM = /\b\d{1,2}\s*[.)]\s*/;
const NUM_LEAD = /^\s*\d{1,2}\s*[.)]\s*/;
const HL_HEAD = /HIGHLIGHTS\s+FOR\s+THE\s+MONTH/i;
const SIG_HEAD = /SIGNALLING\s+WORKS/i;
const ENG_HEAD = /ENGINEERING\s+WORKS/i;
/** Junk lines that never join an item: asterisk separators, signature blocks. */
const JUNK = /^(\*+|-{3,}|nil|Digitally signed.*|Date: ?\d{4}[.\d].*)$/i;

/** A major PCDO section heading — "3.DIRECTED MAINTENANCE : 1. One No…",
 *  "4.INSPECTION DETAILS" — starts with an item number, is shouted in
 *  capitals (works sentences go lowercase after their cap acronyms) and is
 *  short (two-ish words before any colon). */
function isMajorHeading(text: string): boolean {
  // Colon-anchored heading grammar ("3.DIRECTED MAINTENANCE :", "2.Engineering
  // Works:") — judging the tail-70 chars failed when the heading carried an
  // embedded numbered item (sep-26: the whole directive block rode along).
  const m = text.match(/^\s*=?\s*\d{1,2}\s*\.\s*([^:]{4,60}):/);
  if (!m) return false;
  const frag = m[1];
  const letters = frag.replace(/[^A-Za-z]/g, "");
  if (letters.length < 6) return false;
  const caps = letters.replace(/[^A-Z]/g, "").length / letters.length;
  return caps >= 0.75 && frag.trim().split(/\s+/).length <= 4;
}

/** Station token validity: caps-dominant short label ("MADU", "NDL - PNM BI",
 *  "YA-PRDT BI&") — rejects letter prose caught left of the activity column. */
function isStationToken(label: string): boolean {
  const t = label.trim();
  return /^[A-Z][A-Z0-9 '&\-/.]{0,20}$/.test(t) && !/[a-z]{3,}/.test(t);
}

function joinSegs(segs: PcdoSeg[]): string {
  let out = "";
  let prev: PcdoSeg | null = null;
  for (const s of segs) {
    if (prev && s.x - (prev.x + prev.w) > Math.max(prev.h, s.h) * 0.22 && !/\s$/.test(out) && !/^\s/.test(s.str)) {
      out += " ";
    }
    out += s.str;
    prev = s;
  }
  return out.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

type Line = { y: number; segs: PcdoSeg[]; text: string };

function clusterLines(segs: PcdoSeg[]): Line[] {
  const sorted = [...segs].filter((s) => s.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: PcdoSeg[][] = [];
  for (const s of sorted) {
    const cur = groups[groups.length - 1];
    if (cur && Math.abs(cur[0].y - s.y) <= 2.6) cur.push(s);
    else groups.push([s]);
  }
  return groups.map((segs) => ({ y: segs[0].y, segs, text: joinSegs(segs) }));
}

/** Last valid date in the text (office convention: completion date), as ISO. */
export function extractDateIso(text: string): string | null {
  const re = /(\d{1,2})[ ./-](\d{1,2})[ ./-](\d{2,4})/g;
  let best: string | null = null;
  for (const m of text.matchAll(re)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    if (y < 100) y += 2000;
    if (y < 2000 || y > 2099) continue;
    best = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return best;
}

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Split a run of activity text into numbered items; un-numbered text
 *  continues the previous item (wrapped lines, trailing dates). */
function itemsFromText(texts: string[]): PcdoItem[] {
  const items: PcdoItem[] = [];
  for (const raw of texts) {
    const pieces = raw
      // New item at "1. "/"1) text" — the space after the separator keeps
      // dot-dates like 06.05.25 from masquerading as item numbers.
      .split(/(?=\b\d{1,2}\s*[.)]\s)/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const p of pieces) {
      const m = p.match(NUM_ITEM);
      const body = (m ? p.slice(m[0].length) : p).replace(/^[-–—]+\s*/, "").trim();
      if (!body) continue;
      if (/^[.\s*-]+$/.test(body)) continue;
      if (m || items.length === 0) {
        items.push({ text: body, dateIso: extractDateIso(body) });
      } else {
        const last = items[items.length - 1];
        last.text += " " + body;
        last.dateIso = extractDateIso(last.text) ?? last.dateIso;
      }
    }
  }
  return items;
}

type Ev = { kind: "tok"; label: string; y: number } | { kind: "act"; text: string; y: number };

/**
 * Core parser: pdf.js text segments, page by page (each page's lines are
 * y-ordered within the page), → PCDO works per station. Public for the
 * self-check (synthetic fixtures without a real PDF).
 */
/** Observation tap (probes/self-check): labels + y of the last finalized
 *  station table's tokens, and every activity with its resolved label. */
export const pcdoLastEvents: { kind: "tok" | "act"; label?: string; y: number; text?: string }[] = [];

export function parsePcdoSegments(pages: PcdoSeg[][]): PcdoParseResult {
  const res: PcdoParseResult = { stations: [], unattributed: [] };

  type Phase = "scan" | "highlights" | "signalling" | "engineering" | "done";
  let phase: Phase = "scan";

  // Highlights state.
  let hlStation: string | null = null;
  const hlBuckets = new Map<string, string[]>();
  const hlUnattr: string[] = [];
  let hlLastBucket: string[] | null = null;
  let hlBaseX: number | null = null; // outermost (parent) bullet number x
  let hlTextX = 0; // text-start x of the last accepted highlight line
  let hlSawTokRow = false; // stream carries serial+station rows (oct-26 style)

  // Station-table state (shared machinery for signalling/engineering).
  let evs: Ev[] = [];
  let boundary: number | null = null; // first x of the ACTIVITY column
  let tokParts: string[] = []; // consecutive token lines (merged multi-line cells)
  let tokY = 0;
  let actTextX = 0; // text-start x of the last numbered activity line

  const flushTok = () => {
    const label = tokParts.join(" ").trim();
    tokParts = [];
    if (label && isStationToken(label) && !/^(STATION|ACTIVITY|DESCRIPTION)$/i.test(label)) {
      evs.push({ kind: "tok", label, y: tokY });
      return true;
    }
    return false;
  };

  const finalizeTable = () => {
    flushTok();
    // Band assignment. Item numbering restarts at 1 in every station block
    // (Word tables renumber per row-span group), so a "1." act after any
    // numbered act opens the next block; the block's own token row — centred
    // vertically inside its span — lies within the block's y-range. Distance
    // midpoints alone mis-slip border items to a tall neighbour (oct-26
    // SUPP→JMDG) and stall under centred-label poisoning (sep-26), so runs
    // are primary and a plain nearest-separator is only the fallback.
    const tokAt = evs.map((e, i) => (e.kind === "tok" ? i : -1)).filter((i) => i >= 0);
    const tokYs = tokAt.map((i) => (evs[i] as { y: number }).y);
    const acts = evs.filter((e): e is { kind: "act"; text: string; y: number } => e.kind === "act");
    const byTok = new Map<string, string[]>();
    if (tokAt.length && acts.length) {
      const sorted = [...acts].sort((a, b) => b.y - a.y);
      const sep = tokYs.slice(0, -1).map((y, b) => (y + tokYs[b + 1]) / 2);
      const assign = (y: number) => {
        let k = 0;
        while (k < sep.length && y < sep[k]) k++;
        return k;
      };
      const tokLabel = (k: number) => (evs[tokAt[k]] as { label: string }).label;
      type Run = { top: number; bot: number; texts: string[] };
      const runs: Run[] = [];
      let lastNum = 0;
      for (const a of sorted) {
        const m = a.text.match(NUM_ITEM);
        const n = m ? Number(m[0]) : 0;
        if (n === 1 && lastNum !== 0) runs.push({ top: a.y, bot: a.y, texts: [a.text] });
        else if (runs.length) {
          const r = runs[runs.length - 1];
          r.top = Math.max(r.top, a.y);
          r.bot = Math.min(r.bot, a.y);
          r.texts.push(a.text);
        } else runs.push({ top: a.y, bot: a.y, texts: [a.text] });
        if (n) lastNum = n;
      }
      for (const [ri, r] of runs.entries()) {
        if (!r.texts.length) continue;
        const mid = (r.top + r.bot) / 2;
        const inside = tokYs.filter((y) => y <= r.top + 0.5 && y >= r.bot - 0.5);
        let k: number;
        if (inside.length === 1) k = tokYs.indexOf(inside[0]);
        else if (inside.length > 1)
          k = tokYs.indexOf(inside.reduce((b, y) => (Math.abs(y - mid) < Math.abs(b - mid) ? y : b)));
        else k = assign(mid);
        const lbl = tokLabel(k);
        pcdoLastEvents.push({ kind: "act", label: lbl, y: mid, text: r.texts.join(" ¦ ") });
        const arr = byTok.get(lbl) ?? [];
        arr.push(...r.texts);
        byTok.set(lbl, arr);
      }
    }
    pcdoLastEvents.push(...evs.filter((e): e is { kind: "tok"; label: string; y: number } => e.kind === "tok").map((e) => ({ kind: "tok" as const, label: e.label, y: e.y })));
    for (const [label, acts] of byTok) {
      const items = itemsFromText(acts);
      if (items.length) res.stations.push({ label, items });
    }
    evs = [];
    boundary = null;
    tokParts = [];
  };

  for (const pageSegs of pages) {
    for (const line of clusterLines(pageSegs)) {
      const text = line.text;
      if (!text || JUNK.test(text)) continue;
      const lineX = line.segs[0].x;
      const numbered = NUM_LEAD.test(text);

      if (phase === "scan") {
        if (HL_HEAD.test(text)) phase = "highlights";
        else if (SIG_HEAD.test(text) && text.length < 90) {
          phase = "signalling";
          boundary = null;
        }
        continue;
      }

      if (phase === "highlights") {
        if (SIG_HEAD.test(text) && text.length < 90) {
          for (const [label, acts] of hlBuckets) {
            const items = itemsFromText(acts);
            if (items.length) res.stations.push({ label, items });
          }
          if (hlUnattr.length) res.unattributed.push(...itemsFromText(hlUnattr));
          hlBuckets.clear();
          hlUnattr.length = 0;
          hlStation = null;
          hlLastBucket = null;
          phase = "signalling";
          boundary = null;
          continue;
        }
        // Row grammar: serial(-dot) rows "3. text" / "7 TOKEN 1. text"; the
        // station token may ride the same cluster (serial+token centred rows,
        // oct-26) or appear dash-separated (apr-26 "PNM- text").
        let nl = text.match(/^\s*(\d{1,2}\s*[.)]\s*)(.+)$/);
        let serialForm = false;
        if (!nl) {
          const ms = text.match(/^\s*(\d{1,2})\s+([A-Z].+)$/);
          if (ms && NUM_ITEM.test(ms[2].slice(0, 26))) {
            nl = [ms[0], ms[1] + " ", ms[2]] as unknown as RegExpMatchArray;
            serialForm = true;
          }
        }
        if (nl) {
          if (hlBaseX == null || lineX < hlBaseX) hlBaseX = lineX;
          let rest = nl[2];
          // Nested item numbers after a "PNM - 1." station prefix.
          const nest = rest.match(/^\d{1,2}\s*[.)]\s*(.+)$/);
          if (nest) rest = nest[1];
          // Leading caps token directly followed by an item number — the
          // station rides this row (serial+token centred rows).
          const tk = rest.match(/^([A-Z][A-Z0-9 '&\-/.]{1,17}?[A-Z0-9])\s+(?=\d{1,2}\s*[.)]\s)/);
          if (tk) {
            hlStation = tk[1];
            rest = rest.slice(tk[0].length);
          } else {
            const pref = rest.match(/^([A-Z][A-Z0-9 '&\-/.]{1,17}[A-Z0-9])[ \t]*-[ \t]*(.+)$/);
            if (pref) {
              hlStation = pref[1].replace(/[\s\-&/.]+$/, "").trim();
              rest = pref[2];
            } else if (hlBaseX != null && lineX <= hlBaseX + 8 && !serialForm) {
              // Station-less numbered bullet at parent indent (apr-26 style)
              // — its own item, never fused onto the previous station.
              hlStation = null;
            }
          }
          const bucket = hlStation ? (hlBuckets.get(hlStation) ?? []) : hlUnattr;
          if (hlStation) hlBuckets.set(hlStation, bucket);
          // Keep the item number when the string itself lost it (nested /
          // token-riding rows keep theirs; pref rows re-attach nl[1]) — the
          // number is what separates this bullet from the next inside
          // itemsFromText (a number-less string would read as continuation).
          bucket.push(/\s*\d{1,2}\s*[.)]\s*/.test(rest) ? rest : nl[1] + rest);
          hlLastBucket = bucket;
          // Text of the numbered line starts after the number itself (pdf.js
          // delivers "1." and the sentence as separate segments).
          const txSeg = line.segs.find((s) => s !== line.segs[0] && NUM_ITEM.test(s.str.trim())) ?? line.segs[line.segs.length - 1];
          hlTextX = txSeg.x;
        } else if (hlLastBucket && lineX >= hlTextX - 10 && !/^[.\s*-]+$/.test(text)) {
          // Continuation of the previous bullet — only when indented like the
          // item text, so the interleaved letter column never bleeds in.
          hlLastBucket.push(text);
        }
        continue;
      }

      if (phase === "signalling") {
        if ((ENG_HEAD.test(text) && text.length < 60) || isMajorHeading(text)) {
          finalizeTable();
          phase = ENG_HEAD.test(text) ? "engineering" : "done";
          boundary = null;
          continue;
        }
      } else if (phase === "engineering") {
        if (isMajorHeading(text)) {
          finalizeTable();
          phase = "done";
          continue;
        }
      } else {
        continue; // done
      }

      // Station-table body line (signalling/engineering).
      const numberedSegs = line.segs.filter((s) => NUM_ITEM.test(s.str.trim()));
      if (boundary == null && numberedSegs.length) {
        boundary = Math.min(...numberedSegs.map((s) => s.x)) - 2;
      } else if (numberedSegs.length && boundary != null) {
        // Word wanders the activity column leftward block by block (sep-26
        // rows sit at x103 after an x107 first block, so the fixed boundary
        // swallowed PRDT/PNM whole). Follow it down, but only for genuinely
        // item-bearing rows whose text stretches well right of the number and
        // which stay right of the label gutter — otherwise the x10 "3.DIRECTED
        // MAINTENANCE :" heading drags the boundary into the station column
        // (oct-26 regression).
        const nx = Math.min(...numberedSegs.map((s) => s.x));
        if (nx < boundary && nx >= 25 && line.segs.some((s) => s.x + s.w > nx + 60)) boundary = nx - 2;
      }
      if (boundary == null) continue; // header rows before the first activity
      const bnd = boundary;
      const left: PcdoSeg[] = [];
      const right: PcdoSeg[] = [];
      for (const s of line.segs) (s.x < bnd - 0.5 && !NUM_ITEM.test(s.str.trim()) ? left : right).push(s);
      let act = joinSegs(right);
      const startsItem = numberedSegs.length > 0 || (act.length > 0 && NUM_ITEM.test(act));
      // Continuations must sit at (or left of) the activity text indent —
      // wrapped dates hug the column edge, other-page debris hangs far right.
      if (!startsItem && !(lineX >= actTextX - 10 || lineX <= bnd + 25)) continue;
      if (left.length) {
        const leftLabel = joinSegs(left);
        if (leftLabel) {
          flushTok(); // close any open multi-line cell
          tokParts.push(leftLabel);
          tokY = line.y;
        }
      }
      if (act) {
        flushTok(); // emit a staged token (possibly this line's)
        if (startsItem) actTextX = right[0].x;
        // Ghost item leaders ("1." dangling on an otherwise empty row) never
        // start a block — drop them so they can't weigh the band assignment.
        // Two-letter lowercase debris ("nd"/"th" of split superscripts) would
        // glue onto a random item: junk-sized unless caps/digit-bearing.
        const body = act.replace(NUM_LEAD, "").replace(/^[-–—]+\s*/, "").trim();
        if (body && (body.length > 2 || /[A-Z0-9]/.test(body))) evs.push({ kind: "act", text: act, y: line.y });
      }
    }
  }
  finalizeTable();

  // Merge repeated station labels (same station across sections) and drop
  // GLOBAL duplicates (the same work printed in Highlights and the station
  // tables). First occurrence wins; stations emptied this way disappear.
  const merged = new Map<string, PcdoStationWorks>();
  const seen = new Set<string>();
  for (const sw of res.stations) {
    const cur = merged.get(sw.label) ?? { label: sw.label, items: [] };
    for (const it of sw.items) {
      const k = normKey(it.text);
      if (k.length >= 8 && seen.has(k)) continue;
      if (k.length >= 8) seen.add(k);
      cur.items.push(it);
    }
    if (cur.items.length) merged.set(sw.label, cur);
  }
  res.stations = [...merged.values()];
  return res;
}

/**
 * Extract + parse a PCDO PDF's text (browser and Node/tsx both work with the
 * pdfjs legacy build, as in PdfViewer).
 */
export async function extractPcdoWorks(bytes: Uint8Array): Promise<PcdoParseResult> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Browser: same worker asset the PdfViewer ships in /public. Node (the
  // self-check): leave unset so pdf.js falls back to its own fake worker.
  if (typeof window !== "undefined") GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
  const doc = await getDocument({ data: bytes.slice() }).promise;
  const pages: PcdoSeg[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const segs: PcdoSeg[] = [];
    for (const it of tc.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
      const str = String(it.str ?? "");
      if (!str.trim() || !it.transform) continue;
      segs.push({
        x: it.transform[4],
        y: it.transform[5],
        w: it.width ?? 0,
        h: it.height ?? it.transform[3] ?? 10,
        str,
      });
    }
    pages.push(segs);
  }
  return parsePcdoSegments(pages);
}

/** Normalised label → app-station matcher (exact, then code-token, then loose). */
const nzLab = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

export function matchPcdoToStations(
  res: PcdoParseResult,
  stations: { id: number; name: string; code?: string | null }[]
): { matched: Map<string, PcdoItem[]>; unmatched: string[] } {
  const matched = new Map<string, PcdoItem[]>();
  const unmatched: string[] = [];
  for (const sw of res.stations) {
    if (!sw.items.length) continue;
    const lbl = nzLab(sw.label);
    const squash = lbl.replace(/ /g, "");
    const st = stations.find((s) => {
      const nm = nzLab(s.name);
      const cd = nzLab(s.code ?? "");
      if (lbl === nm || (cd && lbl === cd)) return true;
      if (cd && lbl.split(" ").includes(cd)) return true;
      if (nm.replace(/ /g, "").length >= 4 && squash.includes(nm.replace(/ /g, ""))) return true;
      if (cd && cd.length >= 4 && squash.includes(cd)) return true;
      return false;
    });
    if (st) matched.set(st.name, [...(matched.get(st.name) ?? []), ...sw.items]);
    else unmatched.push(sw.label);
  }
  return { matched, unmatched };
}
