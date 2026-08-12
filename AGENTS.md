# Project Workflow Rules

These rules apply to every session working in this repository.

## 1. Sync with the repo before every task

Before starting any task (especially when time has passed since the last
session), first check whether there are new changes to pick up:

1. `git fetch origin` and check `git log --oneline HEAD..origin/master`.
   If there are remote commits, `git pull` them so the working copy matches
   the published code.
2. Read the timeline file **`CHANGELOG.md`**. Every entry references the commit
   hash that implemented it.
3. For each CHANGELOG entry, verify that commit hash is actually in the current
   code (`git merge-base --is-ancestor <hash> HEAD`). If any entry's commit is
   NOT present, the change has not been integrated yet.

## 2. Integrate new changes before continuing

If new changes exist (new CHANGELOG entries whose commits are missing, or new
remote commits), integrate them into the working copy first:

1. Pull the latest code (`git pull origin master`).
2. Rebuild the affected artifacts so the working copy is fully current. The
   single codebase builds **both** APK variants (normal + personal `p`) via
   `scripts/build-variants.sh [normal|p|both]` (default `both`) — or just one
   variant when only that side changed:
   - Both: `npm run apk:build` (web bundles → `cap sync android` → `gradlew
     assembleDebug` → stages `.apk-download/SnTFieldlogbook-v<version>.apk`
     and `...v<version>p.apk`).
   - Normal only (manual-timing changes): `npm run apk:build normal`.
   - Personal only (auto-timing changes): `npm run apk:build p`.
3. If the incoming changes bump the version, update `CHANGELOG.md` and the
   download page (`.apk-download/index.html`) to match.
4. Commit and push the integrated state.

Only then start the task the user actually asked for.

## 3. Changes must always be committed and pushed

- Every change (code, docs, changelog) is committed to `master` and pushed to
  `origin` (mandatory).
- Push only works via the repo-local credential helper
  (`credential.helper=!gh auth git-credential`); `gh` is logged in as
  `emdaslam`.
- Do NOT publish GitHub releases until the user confirms the change works.

## 4. Versioning and release conventions

- Version scheme: `1.7.6.x`; bump by one patch (and `versionCode` +1 in
  `android/app/build.gradle`) per change. The same base version produces both
  the normal APK (`1.7.6.x`, manual timings) and the personal APK
  (`1.7.6.xp`, auto timings). The base lives in `src/lib/types.ts`
  (`APP_VERSION_BASE`); `APP_VERSION` and the APK filename add the `p` suffix.
- Keep `CHANGELOG.md` (timeline) and `.apk-download/index.html` in sync with
  the latest version.
- Build prerequisites: Node 20+, JDK 21 (`JAVA_HOME=/opt/jdk21`), Android SDK 36
  with build-tools 36.0.0, package `in.railway.snt.logbook`. Full details in
  `ANDROID_APK_GUIDE.md`.
- **Signing key**: debug builds must be signed with the repo debug keystore
  (SHA-1 `7B:C9:5F:C1:7F:0F:E4:93:52:1B:48:09:54:46:13:48:4E:73:B7:81`, alias
  `androiddebugkey`, passwords `android`). The working copy lives at
  `~/.android/debug.keystore`; any other key breaks install-over and Drive
  sign-in (error 10). See `ANDROID_APK_GUIDE.md` §5.1.
