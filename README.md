# S&T Field Logbook

Offline-first Android app for Railway S&T (Signalling & Telecom) section staff.
It runs entirely on-device, so it works with no signal, no internet, and no
server. Current version: **1.7.6.14** (`in.railway.snt.logbook`).

## Features

- **Daily log entries** — date, station/movement (Station, Rest, Leave, CR, NH),
  work done, TA claim (100/70/30%), tags, photo/PDF attachments, PCDO special
  works, and disconnection entries (special work / failure / maintenance).
- **Calendar + timeline** — month calendar with entry and tag dots, swipe between
  months, go-to-date picker, tap a day to view its entries.
- **Tags & inspections** — custom tags with per-tag "remind me" intervals and
  side tracking (monthly/quarterly inspection, joint, maintenance, footplate,
  point oiling, battery, failures, and more).
- **Task management** — deficiency tasks (department, station, priority, due
  date, assignee, status), future planned works, and a "select for tomorrow"
  workflow.
- **Reminders** — daily notifications for pending work, due/overdue deficiencies,
  inspection dues, and tag reminders, plus "no entry today" nags until today's
  log is recorded.
- **PDF exports** — Monthly, Diary, PCDO, Inspections, and Tomorrow's Work, with
  per-export text size (10–96), multi-station/multi-department filters, and
  station-wise grouping. Export via share sheet or save to storage.
- **Cloud sync & backup** — optional Google Drive sync (manual or automatic,
  once per day and on data edits) plus full JSON backup/restore.
- **Settings** — stations and staff directory, custom tags, appearance
  (Small/Medium/Large app font), export text size, and a "My Stations" scope
  filter.

## Tech stack

- Web app: Next.js (TypeScript) with a `next export` static build.
- Android wrapper: Capacitor 8.
- PDF generation: jsPDF.
- Local persistence: IndexedDB via Drizzle ORM.

## Repository layout

- `src/` — Next.js app (components, lib, storage schema).
- `android/` — Capacitor Android project (Gradle).
- `CHANGELOG.md` — version timeline; every entry references its commit hash.
- `AGENTS.md` — repo sync / change-integration workflow rules.
- `ANDROID_APK_GUIDE.md` — build, signing, and Google Drive setup details.

## Building the APK

Prerequisites: Node 20+, JDK 21, Android SDK 36 with build-tools 36.0.0.

```bash
# Install dependencies
npm install

# Typecheck
npm run typecheck

# Build the web bundle and sync it into the Android project
npm run apk:sync

# Build the debug APK
cd android && JAVA_HOME=/opt/jdk21 ./gradlew assembleDebug
```

The output APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Signing

Debug builds must be signed with the repo's shared debug keystore (SHA-1
`7B:C9:5F:C1:7F:0F:E4:93:52:1B:48:09:54:46:13:48:4E:73:B7:81`), otherwise
install-over and Google sign-in break. See `ANDROID_APK_GUIDE.md` §5.1.

## Google Drive sync

Requires an OAuth client for `in.railway.snt.logbook` in Google Cloud, a
`web.client_id` in the Capacitor config, and the debug keystore SHA-1 registered
with the client. Full setup steps are in `ANDROID_APK_GUIDE.md` §4.

## Version history

See [CHANGELOG.md](CHANGELOG.md).
