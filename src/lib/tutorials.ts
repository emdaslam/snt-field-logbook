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
  {
    version: "1.7.6.77",
    tag: "Plain black-and-white exports",
    subtitle: "The Diary and TA Journal now export plain (no colours) like the reference sheets — colours are one tap away.",
    slides: [
      {
        glyph: "▦",
        title: "Plain by default",
        body: "The Diary and TA Journal now export in the simple black-and-white reference layout — no shaded headers, no navy headings, no alternating rows. Looks clean when printed or attached to a report.",
      },
      {
        glyph: "▤",
        title: "Want colours? Pick them",
        body: "In the export sheet that appears after tapping “Generate”, choose Colour under the style buttons and export again. Each export type remembers its own choice for next time.",
      },
    ],
  },
  {
    version: "1.7.6.86",
    tag: "Edit the timings",
    subtitle: "The personal build now shows the timings on every daily log and lets you change them.",
    slides: [
      {
        glyph: "◷",
        title: "Timings on every log",
        body: "The daily log now shows the four clock times — departure from HQ, arrival at station, departure from station and arrival back at HQ — pre-filled with the times your TA settings would generate.",
      },
      {
        glyph: "✎",
        title: "Edit to override",
        body: "Change any time and it is saved and printed verbatim in the Diary and TA Journal exports. Untouched entries keep following the TA Auto-Generation windows.",
      },
      {
        glyph: "⇄",
        title: "Footplate legs too",
        body: "The boarding and alighting times of each footplate train leg are shown and editable the same way — leave them alone and they keep generating on every export.",
      },
    ],
  },
  {
    version: "1.7.6.88",
    tag: "One station for PCDO, disconnections & counters",
    subtitle: "The PCDO, disconnection and counter sections share one station — the movement station by default, changeable in any of them.",
    slides: [
      {
        glyph: "▤",
        title: "One shared station",
        body: "On a daily log, the PCDO special work, the disconnections and the counter resets all use a single station — pre-selected to the station of the movement. The three pickers stay in step: change any one and the other two follow.",
      },
      {
        glyph: "⇄",
        title: "Change it from anywhere",
        body: "Each of the three sections shows its own station picker. Pick a different station in any of them — say the work was done at another station — and the whole entry groups under that station in the PCDO export.",
      },
      {
        glyph: "◈",
        title: "Your pick sticks",
        body: "Once you choose a different station it is kept even if you change the movement or use a Rest/Leave/CR/NH entry. Leave it alone and it keeps following the movement station.",
      },
    ],
  },
  {
    version: "1.7.6.89",
    tag: "Two-page diary export",
    subtitle: "Split the month's Diary over two pages — the first half on page 1, the rest on page 2.",
    slides: [
      {
        glyph: "▦",
        title: "Split the diary by days",
        body: "In the Diary export, tap “Two pages (split by days)”. The month's diary is then printed across two pages — the first half of the month (15 or 16 days) on page 1 and the remaining days on page 2, each with its own DATE / TRAIN NO / TIME / FROM / TO / NATURE OF WORK heading.",
      },
      {
        glyph: "▤",
        title: "Works for PDF and Word",
        body: "The split applies to both the PDF and Word exports. A second page always starts with its own column heading, and the designation line sits at the end of the second page. Excel stays one continuous sheet.",
      },
      {
        glyph: "◈",
        title: "Colour pages, plain pages",
        body: "Colour exports carry the page footer on both pages; the plain reference layout stays clean without a footer. The fit-on-one-page and earlier font-size options are still there when you need them.",
      },
    ],
  },
  {
    version: "1.7.6.95",
    tag: "Material transfers between stations",
    subtitle: "Move stock between stations and record which received batch every use or transfer comes from.",
    slides: [
      {
        glyph: "⇄",
        title: "Transfer stock to another station",
        body: "A material in stock now has a violet “Transfer” button. Pick the batch the stock is taken from, the quantity, and the destination station — you can also note where it was placed there (room and remarks). The transfer gets its own date.",
      },
      {
        glyph: "▦",
        title: "Use takes from a received batch",
        body: "When recording a use, choose the exact received delivery the material is taken from. Each batch is shown with its quantity, date, station and where it was kept (for example “IPS Room · birwa”), plus how much of it is still in hand. You cannot take more than the batch has left.",
      },
      {
        glyph: "◈",
        title: "Stock follows the material",
        body: "A station's in-hand now counts received, minus used, minus transferred out, plus transferred in — so low-stock alerts and the Materials report stay correct. The report lists every transfer and what each batch still holds.",
      },
    ],
  },
  {
    version: "1.7.6.98",
    tag: "Ocean theme",
    subtitle: "A new light, coastal look joins Light and Dark in Settings → Appearance.",
    slides: [
      {
        glyph: "◈",
        title: "Pick Ocean in Appearance",
        body: "Open Settings → Appearance and choose Ocean. The whole app switches to a light coastal palette — cool blue-grey surfaces, softer borders and a deep ocean-blue accent on buttons, links and selected chips.",
      },
      {
        glyph: "▤",
        title: "Sits alongside Light and Dark",
        body: "Light stays the default look and Dark is unchanged. The choice is remembered on this device and reapplies every time you open the app.",
      },
    ],
  },
  {
    version: "1.7.7.3",
    tag: "Export matches your theme",
    subtitle: "The export sheet now follows Dark, Ocean and Sunset — no more light-theme popup.",
    slides: [
      {
        glyph: "◈",
        title: "Export sheet follows the theme",
        body: "Tap any export and the Export Report sheet now uses the theme you chose in Settings → Appearance. Sunset shows warm cream with the coral accent, Ocean shows the coastal blues, and Dark shows dark surfaces with light text.",
      },
      {
        glyph: "▤",
        title: "Updates the moment you switch",
        body: "The sheet reads the same theme tokens as the rest of the app, so when you change the theme in Settings the export sheet follows — even if it is already open.",
      },
    ],
  },
  {
    version: "1.7.7.13",
    tag: "Two-page TA Journal export",
    subtitle: "Split the month's TA Journal over two pages — the first half of the TA days on page 1, the rest on page 2.",
    slides: [
      {
        glyph: "▦",
        title: "Split the TA journal by days",
        body: `In the TA Journal export, tap "Two pages (split by days)". The month's TA days are then printed across two pages — the first half on page 1 and the remaining days on page 2, each with its own DATE / TRAIN NO / TIME / STATION / KMS / DAYS / AMOUNT / NATURE OF WORK heading. The vertical "ALL ARE ABOVE 8 KMS" note is drawn in full on every page.`,
      },
      {
        glyph: "▤",
        title: "Works for PDF and Word",
        body: "The split applies to both the PDF and Word exports. The TOTAL row, the 100 / 70 / 30 % summary, the certification line and the signature block sit at the end of the second page. Excel stays one continuous sheet.",
      },
      {
        glyph: "◈",
        title: "Colour pages, plain pages",
        body: "Colour exports carry the page footer on both pages; the plain reference layout stays clean without a footer. The fit-on-one-page and earlier font-size options are still there when you need them.",
      },
    ],
  },
  {
    version: "1.7.7.26",
    tag: "Multiple movements and editable export rows",
    subtitle: "Record more than one station in a single daily log — each stop prints as its own Diary / TA row.",
    slides: [
      {
        glyph: "▦",
        title: "Pick a movement, then add another",
        body: "In a station-movement daily log, once you select a movement an 'Add another movement' button appears below the picker. Tap it to add another station to the same entry — the journey becomes HQ → station → … → station → HQ. Remove an extra stop any time.",
      },
      {
        glyph: "▤",
        title: "Each stop is an export row",
        body: "With two or more movements the form switches to an editable list of journey legs, one per stop. Each leg carries From, To, Time dept, Time arr and Road / Train (with train number); the first leg fills the primary tour timings and the last leg the return.",
      },
      {
        glyph: "◈",
        title: "The Diary and TA Journal follow the rows",
        body: "Each leg appears as its own row in both the Diary and TA Journal exports — the date and Nature of Work columns span all legs exactly as they do on footplate days. A single movement keeps the normal two-row layout.",
      },
    ],
  },
  {
    version: "1.7.7.28",
    tag: "Mix a Footplate ride into a daily-log chain",
    subtitle:
      "Combine station stops and one Footplate journey in the same daily log — the export rows follow the chain in riding order.",
    slides: [
      {
        glyph: "◫",
        title: "Add Footplate as a stop",
        body: "When your trip mixes stations and a single Footplate ride, add the Footplate entry to that day's movement chain. It joins the chain as a special stop — set its boarding and other-end station, and the Day / Night trains as on a normal Footplate day.",
      },
      {
        glyph: "◭",
        title: "Rows follow the ride order",
        body: "The Diary and TA Journal list every leg of the chain in order — road legs to each station and the Footplate's boarding and train legs — so a mixed trip still reads top to bottom as you actually travelled it.",
      },
      {
        glyph: "◮",
        title: "One Footplate per entry",
        body: "Only one Footplate journey is allowed in a single daily log. If the chain already includes one, the option disappears from the extra-stop picker — keep using separate daily logs for any second Footplate ride.",
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
