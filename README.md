# S&T Field Logbook

Offline-first Android app for Railway S&T (Signalling & Telecom) section staff.
It runs entirely on-device, so it works with no signal, no internet, and no
server. Current version: **1.7.8.17** (`in.railway.snt.logbook`).

APK downloads: [emdaslam.github.io/snt-field-logbook](https://emdaslam.github.io/snt-field-logbook/)

## Features

- **Daily log entries** — date, station/movement (Station, Rest, Leave, CR, NH, Footplate), extra stops and temporary stations, work done, TA claim (100/70/30%), tags, photo/PDF attachments, PCDO special works, and disconnection entries.
- **Calendar + timeline** — month calendar with entry and tag dots, swipe between months, go-to-date picker, tap a day to view its entries.
- **Tags & inspections** — custom tags with per-tag "remind me" intervals and side tracking (monthly/quarterly inspection, joint, maintenance, footplate, point oiling, battery, failures, and more).
- **Task management** — deficiency tasks (department, station, priority, due date, assignee, status), future planned works, and a "select for tomorrow" workflow.
- **Reminders** — daily notifications for pending work, due/overdue deficiencies, inspection dues, and tag reminders, plus "no entry today" nags until today's log is recorded.
- **Reports** — Monthly, Diary, TA Journal, PCDO, Inspections, Tomorrow's Work, and Muster (attendance sheet, 11th–10th). PDF, Word and Excel; colour or plain. Auto-generated timings from the TA rate and station travel range. Optional movement-station row under P / OL on the muster.
- **Materials, notes & attachments** — station stock, notes, and photo/PDF attachments.
- **Cloud backup & sync** — optional Google Drive. Saving and the first open of the day only back up dirty days; two-way sync runs on Sign in or Sync to Drive. Full JSON backup/restore.
- **Settings** — profile (office, PF, designation, HQ, TA rate), stations and staff directory, custom tags, appearance (themes and fonts), export text size, and a "My Stations" scope filter.

## Recent updates

- **1.7.8.17** — Drive no longer overwrites a log you just saved. Saves and the daily open only backup dirty days; Sign in / Sync is two-way. A restore that races a save keeps the device copy. More than three differing dirty days asks push vs pull.
- **1.7.8.16** — Muster AMC / DMC span the station row; multi-movement days print station/station.
- **1.7.8.15** — Shorter P / OL band; REST / NH cells merge when stations are on.
- **1.7.8.14** — Optional movement-station row under P / OL on the muster.
- **1.7.8.13** — Re-editing a Footplate daily log no longer adds a spare movement.
- **1.7.8.12** — Writable remarks on Rest / NH / Leave / CR.
- **1.7.8.11** — Muster file naming, period label and centred sheet.
- **1.7.8.10** — Taller muster sheet with header space above (office-sample layout).
- **1.7.8.9** — Temporary stations appear in Search's station filter.
- **1.7.8.8 – 1.7.8.6** — Muster export matches the office sample (landscape, vertical codes, red absence codes).
- **1.7.8.5** — Live Diary preview while editing export rows.
- **1.7.8.2 – 1.7.8.0** — Colour PDF/Word exports, extra Appearance themes and fonts, Attachments restyle.

See [CHANGELOG.md](CHANGELOG.md) for the full timeline.

## Tech stack

- Web app: Next.js (TypeScript) with a `next export` static build.
- Android wrapper: Capacitor 8.
- PDF generation: jsPDF.
- Local persistence: IndexedDB via Drizzle ORM.

## Repository layout

- `src/` — Next.js app (components, lib, storage schema).
- `android/` — Capacitor Android project (Gradle).
- `CHANGELOG.md` — version timeline.
- `AGENTS.md` — repo sync / change-integration workflow rules.
- `ANDROID_APK_GUIDE.md` — build, signing, and Google Drive setup details.
- `.apk-download/` — staged APKs and the download page.

## Building the APK

Prerequisites: Node 20+, JDK 21, Android SDK 36 with build-tools 36.0.0.

```bash
# Install dependencies
npm install

# Typecheck
npm run typecheck

# Web bundle, Capacitor sync, Gradle assembleDebug, stage APK
npm run apk:build
```

The staged APK is `.apk-download/SnTFieldlogbook-v1.7.8.17.apk`.

### Signing

Debug builds must be signed with the repo's shared debug keystore (SHA-1
`7B:C9:5F:C1:7F:0F:E4:93:52:1B:48:09:54:46:13:48:4E:73:B7:81`), otherwise
install-over and Google sign-in break. See `ANDROID_APK_GUIDE.md` §5.1.

## Google Drive sync

Requires an OAuth client for `in.railway.snt.logbook` in Google Cloud, a
`web.client_id` in the Capacitor config, and the debug keystore SHA-1 registered
with the client. Full setup steps are in `ANDROID_APK_GUIDE.md` §4.

Saving an entry and the first app-open of the day only **back up** new or
changed days. Two-way sync (and restore) runs when you Sign in or tap Sync to
Drive.

## Version history

See [CHANGELOG.md](CHANGELOG.md).
