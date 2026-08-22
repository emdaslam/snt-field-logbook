"use client";

import { APP_VERSION_BASE } from "./types";

export type TutorialSlide = { glyph: string; title: string; body: string };

export type VersionTutorial = {
  version: string;
  tag: string;
  subtitle: string;
  slides: TutorialSlide[];
};

const LS_LAST_VERSION = "snt.lastTutorialVersion";
const LS_SKIP = "snt.tutorialsSkipped";
const LS_LEGACY_SHOWN = "snt.whatsNewShown";

/**
 * Catalog of "major" changes, one entry per version that deserves a tutorial.
 * Sorted ascending — the queue shows them oldest first so a user jumping from
 * an old version to the latest sees everything they missed in order.
 */
export const TUTORIAL_CATALOG: VersionTutorial[] = [
  {
    version: "1.7.6.38",
    tag: "PCDO department-wise",
    subtitle: "Special works are now recorded and exported department-wise.",
    slides: [
      {
        glyph: "▦",
        title: "Pick the departments",
        body: "When “PCDO — Special Work” is ticked on a daily log, you now choose one or more departments — Signalling, Engg, OHE, Telecom — and describe the work done for each in its own box.",
      },
      {
        glyph: "▤",
        title: "Export by department",
        body: "The PCDO export is still grouped station-wise, but each station now has a sub-section per department with the date and its special-work text, each with a colour-coded badge.",
      },
    ],
  },
  {
    version: "1.7.6.39",
    tag: "Search highlight",
    subtitle: "Matches light up as you type.",
    slides: [
      {
        glyph: "⌕",
        title: "Highlighted matches",
        body: "In Global Search, the station or work title and the matching body text of every result are highlighted in amber wherever the search term appears.",
      },
      {
        glyph: "◈",
        title: "Everywhere you search",
        body: "Notes search highlights matches in the note title and body too. Highlighting is case-insensitive and mirrors each screen’s existing search matching.",
      },
    ],
  },
  {
    version: "1.7.6.43",
    tag: "Search covers notes",
    subtitle: "Global Search finds your notes, and backups now include settings.",
    slides: [
      {
        glyph: "☰",
        title: "Search covers notes",
        body: "Global Search now finds Important Notes too — search their title or body from any tab, and the All Types filter gains a Note option to narrow results to notes.",
      },
      {
        glyph: "▸",
        title: "Open the note in place",
        body: "Tapping a note result opens the Important Notes tab with that note expanded and scrolled into view, with any category or search filter cleared.",
      },
      {
        glyph: "▤",
        title: "Backup includes settings",
        body: "Backups now capture app settings as well — font size, reminder lead time, TA windows, export format and PDF text size. Restoring reapplies them and reloads the app.",
      },
    ],
  },
  {
    version: "1.7.6.44",
    tag: "Counter resets",
    subtitle: "Record resets in the daily log and print them in the PCDO export.",
    slides: [
      {
        glyph: "▦",
        title: "Counter Resets in the daily log",
        body: "Tick Counter Resets to record resets on the equipment that carry registers — MSDAC, UFSBI Block Instrument or BPAC — with counts for Failures and for Testing. Several resets can be entered on the same day.",
      },
      {
        glyph: "⇄",
        title: "Station vs section",
        body: "MSDAC counters belong to the entry’s station. UFSBI and BPAC counters belong to the section between two stations — the entry reads Station A → Station B, and you pick the next station.",
      },
      {
        glyph: "▤",
        title: "In the PCDO export and Reports",
        body: "The PCDO export prints a Counter Resets summary right after Disconnections, grouped station-wise with Failures / Testing / Total. The Reports tab shows a Counter Resets count with a per-equipment breakdown.",
      },
    ],
  },
  {
    version: "1.7.6.54",
    tag: "Materials tab",
    subtitle: "Keep every required material, log receipts and usage, and see the station-wise summary.",
    slides: [
      {
        glyph: "▦",
        title: "Materials tab",
        body: "The hamburger menu now has a Materials tab that keeps every material required for maintenance work, with the required quantity and its unit.",
      },
      {
        glyph: "⇄",
        title: "Receive & Use",
        body: "Tap Receive to log a delivery (quantity, date, station, room and where it was placed) and Use to log what was consumed. The outstanding Required figure drops by itself as material arrives.",
      },
      {
        glyph: "＋",
        title: "Add & + Req",
        body: "The + button adds a new material. “+ Req” adds extra requirement on top of the current amount without opening the edit form.",
      },
    ],
  },
  {
    version: "1.7.6.55",
    tag: "Equipment groups",
    subtitle: "Materials are grouped by equipment, with custom groups of your own.",
    slides: [
      {
        glyph: "▣",
        title: "Grouped by equipment",
        body: "The required list is grouped by equipment — general, point, signal, block instrument and more. Materials entered before this release are grouped under general.",
      },
      {
        glyph: "＋",
        title: "Custom equipment",
        body: "“+ New Equipment” or “Add new equipment…” in the Add / Edit form creates a custom group, shown after the defaults. Custom equipment syncs to Drive and is included in JSON backups.",
      },
      {
        glyph: "▤",
        title: "Grouped in exports too",
        body: "The PDF export’s summary is grouped by equipment in the same order, and each material’s detail section shows which equipment it belongs to.",
      },
    ],
  },
  {
    version: "1.7.6.59",
    tag: "Dark theme",
    subtitle: "Choose between the default Light look and a Dark theme.",
    slides: [
      {
        glyph: "◐",
        title: "Theme picker",
        body: "Settings → Appearance → Theme now offers Light and Dark. Light is the default look; Dark switches the app to dark surfaces with lighter text throughout.",
      },
      {
        glyph: "▣",
        title: "Remembered for you",
        body: "Your theme choice is saved on this device and is included in JSON backups, so a restore brings your theme back with it.",
      },
    ],
  },
  {
    version: "1.7.6.60",
    tag: "Add on a selected date",
    subtitle: "New daily logs start on the calendar date you picked.",
    slides: [
      {
        glyph: "🗓",
        title: "Log for the chosen day",
        body: "After selecting a date in the calendar, tap + → Add Daily Log and the form opens on that selected date instead of today.",
      },
    ],
  },
  {
    version: "1.7.6.62",
    tag: "Variable TA at a KMs marker",
    subtitle: "Stations split across the 8 km line now ask which side you worked on.",
    slides: [
      {
        glyph: "▤",
        title: "Variable station setting",
        body: "In Settings → Manage Stations a station can now be marked Variable. You set the KMs marker at which its “greater than 8 km” side starts — one side of the station is within 8 km, the other is beyond it.",
      },
      {
        glyph: "◍",
        title: "Asked during logging",
        body: "When you log work at a variable station, the daily log asks “Worked at [KMs] KMs?”. Answer Yes to claim TA for that day; No records the work within 8 km without TA.",
      },
      {
        glyph: "▤",
        title: "Shown in the exports",
        body: "TA Journal and Diary entries that qualify carry “at [KMs]” at the end of the work text, and only Yes answers are written into the TA Journal.",
      },
    ],
  },
  {
    version: "1.7.6.64",
    tag: "WhatsApp feedback group",
    subtitle: "Share feedback and report issues from inside the app.",
    slides: [
      {
        glyph: "✉",
        title: "Join the feedback group",
        body: "Settings → About now has a “Join WhatsApp feedback group” button. Tap it to open the WhatsApp group where you can send feedback, report issues and suggest improvements.",
      },
    ],
  },
  {
    version: "1.7.6.65",
    tag: "Minimum spare alerts",
    subtitle: "Set a minimum spare per material — the app warns when a station's in-hand stock drops below it.",
    slides: [
      {
        glyph: "▦",
        title: "Set the minimum spare",
        body: "When adding or editing a material, set the Minimum required spare (e.g. 10). It is the level of in-hand stock you want to keep available at every station.",
      },
      {
        glyph: "▤",
        title: "Low-stock alert",
        body: "Once a station's in-hand quantity falls below the minimum, the material appears in a red Low stock section in the Materials tab — “only X in hand, minimum required Y” — and in the Alerts bell.",
      },
      {
        glyph: "◈",
        title: "On your phone too",
        body: "Low-stock items are included in the daily reminder notifications, so the phone alerts you even when the app is closed. Tapping the alert opens the Materials tab.",
      },
    ],
  },
  {
    version: "1.7.6.69",
    tag: "One-page diary export",
    subtitle: "Export the whole month's Diary on a single A4 page — the heading stays on one line.",
    slides: [
      {
        glyph: "▦",
        title: "Fit the diary on one page",
        body: "In the Diary export, tap “Fit on one page”. The diary is then scaled down — trimmed margins, no footer — so the entire month fits on a single A4 page, just like the TA Journal.",
      },
      {
        glyph: "▤",
        title: "Heading on one line",
        body: "The “DIARY OF SRI … FOR THE MONTH OF …” heading always stays on a single line; if it is too long the heading font shrinks slightly to fit.",
      },
    ],
  },
  {
    version: "1.7.6.71",
    tag: "Station-wise materials",
    subtitle: "Materials are now tracked station by station, with a requirement and low-stock minimum per station.",
    slides: [
      {
        glyph: "▦",
        title: "Requirements per station",
        body: "Each material has a default requirement. From a station's own list you can set or add a different requirement for that station — and give it a minimum spare to keep in hand.",
      },
      {
        glyph: "⌂",
        title: "Receive and use per station",
        body: "Receive and Use now record against the station you picked. The Materials tab groups everything station-wise, with received, used and in-hand totals for each station.",
      },
      {
        glyph: "▤",
        title: "Low-stock alerts",
        body: "The app warns you when a station's in-hand quantity drops below that station's minimum. Stations without a minimum set are never alerted.",
      },
      {
        glyph: "▸",
        title: "Three export types",
        body: "The Materials export menu now offers In-Hand Materials, Required Materials and the full report — overall and station-wise summaries in each.",
      },
    ],
  },
  {
    version: "1.7.6.73",
    tag: "Station-wise materials & equipment",
    subtitle: "Pick the station(s) when adding a material, and each station's list is grouped by equipment.",
    slides: [
      {
        glyph: "⌂",
        title: "Assign stations when adding",
        body: "The Add Material form now asks which station(s) the material belongs to. A material saved with no station used to disappear — now every new material is assigned to at least one station and shows up in its list.",
      },
      {
        glyph: "▣",
        title: "Equipment-wise sub-sections",
        body: "Inside each station, materials are grouped by equipment — point, signal, block instrument, general and your custom groups — each under its own heading, like a stock book.",
      },
      {
        glyph: "▤",
        title: "Edit the assignment later",
        body: "Open Edit on any material to add or remove the stations it belongs to. Requirements and minimum spares you set per station are never disturbed.",
      },
    ],
  },
  {
    version: "1.7.6.76",
    tag: "Travel details & exact TA amounts",
    subtitle: "Say how you travelled to the station and back, and TA amounts keep their paise.",
    slides: [
      {
        glyph: "▤",
        title: "How did you travel?",
        body: "On a station or footplate daily log, the form now asks whether each journey — on-board and return — was By Road (the default) or By Train. Choose By Train to enter the train number.",
      },
      {
        glyph: "▤",
        title: "Printed in the exports",
        body: "The Diary and TA Journal print ROAD or the train number in the train column for both legs, so your monthly report shows exactly how you travelled.",
      },
      {
        glyph: "₹",
        title: "Exact TA amounts",
        body: "TA amounts in the TA Journal now keep their decimals — no more rounding to whole rupees. A 192.85 amount exports as 192.85, and every total is exact to the paisa.",
      },
    ],
  },
];

function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Tutorials the user has not seen yet, oldest first.
 *
 * - `snt.tutorialsSkipped = "1"` suppresses tutorials permanently.
 * - `snt.lastTutorialVersion` is the newest version whose tutorial was seen;
 *   anything newer in the catalog is queued.
 * - First run of this system: if the user already saw the 1.7.6.57 what's-new
 *   (which covered the Materials work through 1.7.6.56) we treat them as
 *   up-to-date there; otherwise they have seen nothing, so every major change
 *   is queued.
 */
export function getPendingTutorials(): VersionTutorial[] {
  if (typeof window === "undefined") return [];
  try {
    if (localStorage.getItem(LS_SKIP) === "1") return [];
    let last = localStorage.getItem(LS_LAST_VERSION);
    if (last === null) {
      last = localStorage.getItem(LS_LEGACY_SHOWN) ? "1.7.6.56" : "0.0.0";
      localStorage.setItem(LS_LAST_VERSION, last);
    }
    return TUTORIAL_CATALOG.filter(
      (t) =>
        compareVersion(t.version, last) > 0 &&
        compareVersion(t.version, APP_VERSION_BASE) <= 0,
    );
  } catch {
    return [];
  }
}

export function markTutorialsSeen(version: string): void {
  try {
    localStorage.setItem(LS_LAST_VERSION, version);
  } catch {
    /* storage unavailable */
  }
}

export function markTutorialsSkipped(): void {
  try {
    localStorage.setItem(LS_SKIP, "1");
    localStorage.setItem(LS_LAST_VERSION, APP_VERSION_BASE);
  } catch {
    /* storage unavailable */
  }
}
