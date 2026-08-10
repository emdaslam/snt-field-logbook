# S&T Field Logbook — Change Timeline

Version history of the offline Android app. Newest first.
For build / signing / Drive-setup details see [ANDROID_APK_GUIDE.md](ANDROID_APK_GUIDE.md).

## 1.7.6.23p — 2026-08-10 (current — owner personal build)

> This version lives on the **`personal/owner`** branch: it carries features for
> the owner's personal use only and is **not** part of the public `master`
> releases.

**Feat: Diary and TA Journal exports match the reference workbook layouts** — `e3c5210`
- The **Diary export** is rewritten to the reference format
  `DATE | TRAIN NO | TIME DEP | TIME ARR | FROM | TO | NATURE OF WORK`:
  each away day produces **two rows** (HQ → station, then the return leg), HQ
  days show as `AT <HQ>`, and Rest/NH/Leave/CR days collapse into a single
  `AVAILED …` row.
- A new **TA Journal export** is added — `SOUTH CENTRAL RAILWAY. GUNTAKAL
  DIVISION` header (Name / Designation / P.F.NO and HQ / Month / B.U.No), the
  10-column table with `KMS / DAYS / AMOUNT`, a rate-wise summary
  (`1.0 X … / 0.7 X … / 0.3 X …` and a total), and the certification +
  signature block.
- Both exports use **station codes** (e.g. `JMDG`, `SJMA`) instead of full
  station names, and `ROAD` as the train number.
- **Departure / arrival times are derived automatically** per TA rate
  (100% → 06:30–07:30 / 18:40–20:00, 70% → 08:00–09:00 / 16:30–18:30,
  30% → 08:45–09:30 / 14:00–16:00) plus the station's stored travel range;
  the times are seeded so re-exporting the same period gives identical timings.
- The TA amount is a fixed **₹1000/day**; the KMS column always reads
  `ALL ARE ABOVE 8 KMS`.
- The export bottom sheet gains a third format, **Excel (.xlsx)**, alongside
  PDF and Word.
- Staff profiles gain optional **PF No** and **B.U. No** fields (Settings →
  My Profile), rendered in the TA Journal header.

## 1.7.6.22 — 2026-08-10 (current)

**Feat: station travel time is now a range (min–max) instead of a single value** — `3e80ce9`
- The travel time from the headquarters to a station is stored as a **range**,
  e.g. *40 to 55 min*, reflecting how long the trip typically takes.
- The Add Station form and the station Edit dialog take a **min** and a **max**
  travel time; the list shows the range (`40–55 min`) or a single value when
  both ends match.
- The **headquarters station** stays locked at *below 8 km* and *0–0 min* with
  its inputs disabled.

## 1.7.6.21 — 2026-08-10

**Feat: stations record their distance from the headquarters and travel time** — `fc412b5`
- Each station now stores whether it is **below 8 km** or **above 8 km** from
  the headquarters station, plus the **travel time (minutes)** from the
  headquarters to that station.
- The new fields are entered when adding a station and editable later via a new
  Edit button on each station row in Settings → Manage Stations; the distance /
  time also shows next to every station in the list.
- The **headquarters station** (the one selected as HQ in the current user's
  profile) is locked: its distance is fixed at *below 8 km* and its travel time
  at *0 min*, and those inputs are disabled in the editor.

## 1.7.6.20 — 2026-08-09

**Feat: easier date navigation and a reorganised Settings page**
- The calendar now shows a compact calendar-icon button (opens the native date
  picker) and a "Today" button that jumps straight back to the current day,
  both 25 px tall and side by side.
- Settings is collapsed into horizontally grouped sections — Account &
  Directory, Tags & Notifications, Backup & Drive, Appearance & Font Size, and
  About — so you reach what you need with one tap.

## 1.7.6.19 — 2026-08-09

**Feat: Google Drive backups are stored per day, so each sync uploads only what changed instead of the whole database** — `cd0b024`
- The single `snt-logbook-backup.json` is replaced by one small file per log
  date (photos included), one data file for the non-log tables, and a tiny
  index. A normal sync pushes only the touched day(s) plus the index — entering
  one daily log no longer re-uploads the entire backup, and the app-data
  storage quota is no longer wasted on redundant uploads.
- Restore pulls the index, the data file and every day file and imports them
  all at once, so nothing is missed on a new device.
- The first sync after the update migrates the existing single-file backup
  into the per-day layout automatically and then removes the old file — data
  is never lost in between.
- Every write (log, deficiency, planned work, station, staff, tag, note) marks
  exactly what changed, so unchanged days are never re-sent.
- The Drive Sync panel in Settings now remembers the outcome of the last sync —
  e.g. `Synced to Drive (1 day, 3.2 KB)` or `Already up to date (37 days backed
  up)` — so the per-day upload is visible even when an automatic sync performed
  it. — `9c45bca`

## 1.7.6.18 — 2026-08-09

**Feat: deficiency station defaults to the latest daily-log station; PCDO export keeps only the all-stations disconnection summary** — `989f438`
- Adding a deficiency now pre-fills the Affected Station with the station from
  the most recent daily log entry (the user can still change it).
- The PCDO export no longer prints the per-station, date-wise disconnection
  tables — the single station-wise summary table with the grand total is enough.

## 1.7.6.17 — 2026-08-08

**Fix: disconnection counts no longer show NaN in reports** — `f1e9c68`
- Logs saved before the Not Permitted purpose was added stored the disconnection
  fields as missing, so reports (PCDO export, monthly report, report summaries)
  summed `undefined` values into NaN. Reads are now sanitised so every
  disconnection count defaults to 0 for older entries.

## 1.7.6.16 — 2026-08-08

**Feat: Not Permitted disconnection purpose, 3-row global search filters, entry text size, grouped Drive/backup settings, per-version About** — `7948bd8`
- Disconnection counts gain a fourth "Not Permitted" purpose: the daily log
  form counts it, PCDO exports and reports include a "Not Permitted" column
  with totals, and the timeline / log detail / monthly report show it.
- The global search filters now sit in a fixed 3-column grid, so they take
  three rows even at the Large app font size instead of overflowing.
- An "Entry text size" option (100 / 125 / 150%) scales the written content on
  the Home and Tasks tabs independently of the app-wide font size.
- Deficiency / planned-work reminder days in Settings now apply via an explicit
  Edit + Save flow instead of an always-on input.
- Go-to-date now warns with the nearest valid boundary date, not the date you
  typed, when the pick is out of range.
- Settings groups manual Data Backup & Restore directly under Google Drive
  sync, and the About panel shows the exact app version.
- Tomorrow's Work export drops the priority badge and keeps the bullet dots.

## 1.7.6.15 — 2026-08-08

**Feat: attachments on deficiencies/planned works, Task Manager station+department filters, DOCX export** — `cff8ce1`
- Deficiency tasks and planned works now support attachments (photos/PDFs),
  added from their forms and shown as tappable thumbnails on the Task Manager
  rows, opening the same image/PDF preview with open-with and share actions.
- Planned works gain a Department field (defaults to Signalling), and both the
  Deficiencies and Planned tabs get Department + Station dropdown filters at
  the top, so the pending lists can be narrowed down in one tap.
- The monthly export's planned-work table now includes a Department column.
- Every export report (Tomorrow's Work, PCDO, Diary, Inspections, Monthly) can
  be produced as a PDF or as a Word (.docx) document via a toggle in the export
  sheet, remembering the last chosen format. The DOCX is generated fully
  offline by a built-in OOXML/ZIP writer — no new dependency.

## 1.7.6.14 — 2026-08-07

**Fix: persistent Drive sign-in, reliable auto-sync, smarter sync icon** — `998e3c8`
- Google sign-in now persists: the app remembers the account and silently
  refreshes the token, so it stays logged in until you sign out and no longer
  asks for a login on every sync.
- Signing out and signing in with another account no longer fails with "Could
  not determine the signed-in Google account" — the picked account is resolved
  from its ID token even when Google returns it without profile fields.
- New logs, deficiency/planned-work changes and notes now auto-sync to Drive
  (previously only new daily logs attempted it). Manual sync never pops the
  Google picker unless you are not signed in at all.
- Header sync button now performs a real Drive sync and shows its state:
  spinning while syncing, a static arrow when local changes are pending, and a
  green tick when everything is synced.

## 1.7.6.13 — 2026-08-07

**Fix: PDF heading/table spacing + configurable reminder window** — `ba27075`
- PDF exports: a station name heading now sits right above its table with only a
  small visible gap, and a clear 24pt gap follows the table before the next
  heading, so each station group reads as one block (applies to tables and
  bullet-list groups in all exports).
- Settings: new "Warn before (days)" under Notifications sets how many days
  before its due date a deficiency task or planned work starts warning.
  Default is 3 days; the value is remembered per device. Overdue items always
  warn.

## 1.7.6.12 — 2026-08-07

**Feat: station-filtered "Tomorrow's Work" selection + direct go-to-date + per-export font size** — `a7dab00`
- **Tomorrow's Work**: the export sheet gains a station multi-select filter, plus
  "Select all"/"Clear" buttons scoped to the filtered items, so picking one
  station's deficiencies and planned works is a single step.
- **Go to date**: the calendar now shows a visible bordered "Go to date" button
  that opens the native date picker directly (no extra sheet/step), and jumping
  outside the timeline range reports the exact chosen date
  ("No entry beyond 15 Aug 2026" / "No entry before …").
- **Export text size**: the fixed default in Settings is gone. Each export type
  (monthly, tomorrow's work, diary, PCDO, inspections) remembers the last text
  size chosen in its share/save sheet and reuses it next time; the size can
  still be changed on every export.

## 1.7.6.11 — 2026-08-06

**Feat: per-export text size + upgraded monthly report** — `cff4b17`
- **Export text size** — Settings gains a numeric text size (10–96) that scales
  only the written content in exported PDFs (the app UI is untouched). Every
  PDF export now asks for the text size at the top of the share/save sheet,
  pre-filled with the saved value; changing it there also updates the default.
- **Monthly export filters** — Station and Department are now multi-select
  (tick several, or none = all). The header lists every chosen station/dept.
- **Monthly report layout** — Deficiency Tasks and Planned Works are grouped
  station-wise (a heading per station with its own table, station column
  dropped since it's already the group header). Daily Logs are exported in
  ascending date order.

## 1.7.6.10 — 2026-08-06

**Feat: four new user-requested behaviours** — `f58f17d`
- **"No entry today" reminders** — when no daily log entry exists for today,
  four notifications (9:00 / 12:00 / 15:00 / 18:00) keep nagging until the
  entry is added; they are cancelled the moment the entry is recorded.
- **Automatic cloud sync** — new "Automatic cloud sync" toggle in the Google
  Drive Sync settings (on by default). Auto-sync runs when a new daily log
  entry is added and once on the first app open of the day. Silent and
  best-effort; the manual "Sync to Drive" button still reports errors.
- **New defaults** — app font size defaults to Large (was Medium) and a new
  daily log entry defaults to 70 % TA (was 100 %). Special cases are
  unchanged: Rest/Leave/CR/NH, headquarters visits and dates that already
  carry a TA claim force 0 %.
- **Calendar slide sensitivity & month jump** — swiping between months now
  needs a much shorter flick, and when a slide commits to another month the
  timeline jumps to the 1st of that month (dates outside the timeline range
  clamp silently to the nearest boundary).

## 1.7.6.9 — 2026-08-06

**Fix: notifications are station-based, side text only when explicitly chosen** — `40e3b92`
Deficiency notifications no longer say "towards … side" — they show just the
station. Planned-work notifications now name their station too. Inspection
reminders keep the "towards … side" phrasing only when the driving tag has
"asks for side" enabled in custom tag management; otherwise they show the
station only.

## 1.7.6.8 — 2026-08-06

**Feat: "Go to date" from the calendar header** — `b6596fa`
Tapping the month/year label in the upper calendar opens a date picker that
jumps the calendar and timeline straight to the chosen date. If the date falls
outside the timeline's range (no entries there), a message appears ("No entry
beyond the nearest date" / "No entry before the earliest date") and the app
lands on the nearest boundary date instead.

## 1.7.6.7 — 2026-08-06

**Fix: PDF export & backup save no longer fail with EACCES on Android 10+** — `9d2ff86`
Android scoped storage blocks direct writes to `/storage/emulated/0/Documents`,
which broke "Save file" for PDFs and the JSON backup ("open failed: EACCES").
Added a native `DocumentSave` plugin that saves via Android's Storage Access
Framework ("Save to…" picker), so the user chooses the location and no storage
permission is needed. "Share" now stages the PDF in the app cache (always
writable) before handing it to the share sheet, matching how attachments work.

## 1.7.6.6 — 2026-08-05

**Fix: never overwrite the Drive backup with an unknown local database**
`519a79e` — Sync used to push first and pull second, so on a fresh install the
good Drive backup was overwritten with the empty/default database and Sync then
reported "already up to date". Sync is now timestamp-aware (last-write-wins on
the backup's `exportedAt`): if the local version is unknown or older, the Drive
copy is restored first; the local copy is only uploaded when it is proven at
least as new, or when no backup exists yet. Also added HTTP status codes to
Drive API error messages.

## 1.7.6.5 — 2026-08-05

**Fix: app-data files now created with the appDataFolder parent**
`138d067` — The `drive.appdata` scope only allows files inside the app's
private Drive folder. The old `uploadType=media` create dropped the metadata and
tried to write to the user's root Drive, failing with `403`. New-file creation
now uses a multipart/related upload with `parents: ["appDataFolder"]`, so uploads
succeed and the backup lives in the hidden app-data folder.

## 1.7.6.4 — 2026-08-05

**Fix: fall back to the device Google account for the Drive token**
`1a89565` — When the sign-in result exposes no email/account, the plugin now
uses the single Google account registered on the device (AccountManager) and
reports `idTokenEmail` + `googleAccounts` counts for diagnosis.

## 1.7.6.3 — 2026-08-05

**Fix: sign out before sign-in to force a fresh account pick**
`b2cce56` — Diagnostics showed the restored sign-in had an ID token but no email
or account (a cached Google sign-in with missing profile data). Signing out first
makes the sign-in intent show the account picker again and return a complete
account.

## 1.7.6.2 — 2026-08-05

**Fix: extract the sign-in email from the ID token when the profile is empty**
`ec264aa` — Google cached sign-ins can return an account with empty email/account
fields. The plugin now decodes the ID token JWT (which carries the `email` claim)
in both the sign-in and scope-consent paths, and the failure message reports which
account fields were available.

## 1.7.6.1 — 2026-08-05

**Fix: remember the signed-in email across the Drive scope consent**
`bad5836` — After Google's scope-consent relaunch, `getLastSignedInAccount()` can
return an account with no email, breaking the token fetch. The email captured at
sign-in time is now reused in `fetchAccessToken`.

## 1.7.6 — 2026-08-05

**Fix: handle a null `Account` from `GoogleSignInAccount` during token fetch**
`7547894` — `GoogleAuthUtil.getToken()` throws "account cannot be null" when
`getAccount()` returns null. The plugin now builds the `android.accounts.Account`
from the sign-in email when that happens.

## 1.7.5 — 2026-08-05

**Fix: corrected Google web client ID (removed the `cli` prefix)**
`31381cf` — The embedded OAuth client ID had a spurious `cli` prefix, so the
ID-token exchange failed with `SIGN_IN_FAILED (10)` right after the consent
screen. Client IDs are `<project-number>-<suffix>.apps.googleusercontent.com`
with no prefix.

## 1.7.4 — 2026-08-05

**Fix: registered the GoogleDrive plugin before bridge creation**
`efff692` — `registerPlugin()` was called after `super.onCreate()`, by which
point the Capacitor bridge was already built without the plugin, so the JS
`isConfigured()` call threw and Settings reported "Not configured" even though a
real client ID was embedded.

## 1.7.3 — 2026-08-05

**Chore: embedded the real Google OAuth web client ID** — `ff12539`

## 1.7.2 — 2026-08-05

**Feat: Google Drive sync (first build)** — `de9456d`
Native Google Sign-In via a project-local Capacitor plugin
(`GoogleDrivePlugin`), push/pull of the whole database as one JSON backup in the
app's private Drive app-data folder, Settings UI section, and a `disabled`
state for the primary button. This build shipped with a placeholder client ID;
the real one arrived in 1.7.3.

## 1.7.1 — 2026-08-04

**Feat + bump** — `3c0d67b`, `ba123bf`
Rich notification details (due item names on the lock screen), calendar dot
spacing fix, and tappable search results. Corrected the APK spelling from
"Feild" to "Field".

## 1.7.0 — 2026-08-04

**Feat + bump** — `9f9b287`, `7415d1d`, `cfede91`
First-run onboarding (stations, profile, tutorials), attachments filter that
means "files only" and highlights when active. First version shipped under the
new `SnTFieldlogbook-v*.apk` naming (older archive kept as `SnTFeildlogbook-…`).

## 1.6.0 — 2026-08-04

**Feat: v1.6** — `cc5830a`
PDF viewing, smart reminders, attachments hub, and tag sides. Plus calendar swipe
to flip months (`b722902`) and smooth drag-follow sliding (`619e0b5`).

## 1.6.1 — 2026-08-03

Maintenance build (debug-signed), included in the archived APK list.

## 1.5 — 2026-08-02

Earlier feature build (archived APK only).

## 1.4 — 2026-08-02

Earlier feature build (archived APK only).

## Initial commit — 2026-07-31

Project bootstrap and the offline-first logbook web app. — `de81a61`

---

## How versions are shipped

1. Bump `versionCode` (always +1) and `versionName` in `android/app/build.gradle`.
2. Rebuild the web bundle (`npm run apk:sync`) and the APK (`./gradlew assembleDebug`).
3. Copy to `.apk-download/SnTFieldlogbook-v<version>.apk`.
4. Publish as a GitHub release (tag `v<version>`, "Latest") with the APK attached.
