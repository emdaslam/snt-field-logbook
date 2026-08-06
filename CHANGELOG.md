# S&T Field Logbook — Change Timeline

Version history of the offline Android app. Newest first.
For build / signing / Drive-setup details see [ANDROID_APK_GUIDE.md](ANDROID_APK_GUIDE.md).

## 1.7.6.9 — 2026-08-06 (current)

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
