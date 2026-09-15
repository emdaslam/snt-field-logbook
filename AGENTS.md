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
2. Do NOT rebuild APKs that are already present in the repo. The upstream
   commits carry their own built APKs (`.apk-download/SnTFieldlogbook-v…apk`);
   take those as-is. Rebuild only when making NEW changes that bump the version,
   never just to "refresh" already-committed artifacts — a rebuild produces a
   binary-only diff with no functional value.
   When a NEW change does need a build, follow §2.5: commit and push the code
   first, then ask for build approval — never auto-build while integrating.
   `npm run apk:build` builds both variants
   (web bundles → `cap sync android` → `gradlew assembleDebug` → stages
   `.apk-download/SnTFieldlogbook-v<version>.apk` and `...v<version>p.apk`);
   `npm run apk:build normal` or `npm run apk:build p` builds one side only.
3. If the incoming changes bump the version, update `CHANGELOG.md` and the
   download page (`.apk-download/index.html`) to match.
4. Commit and push the integrated state.

Only then start the task the user actually asked for.

## 2.5 Every change: classify major/minor, add tutorials, release APKs

For **every** code change, the following release steps are mandatory:

1. **Classify the change.** If the user did not state whether the change is
   major or minor, **ask** (with `question`): a change is *major* when it adds
   or significantly changes a user-facing feature; otherwise it is *minor*
   (bug fix, refactor, styling, wording, etc.). Record the classification in
   the CHANGELOG entry.
2. **Major changes get a tutorial.** For every major change, add a
   `VersionTutorial` entry (with slides) to the tutorial catalog in
   `src/lib/tutorials.ts` for the new version. The catalog is version-ordered
   (ascending); `getPendingTutorials()` shows it to any user upgrading from an
   older version. Minor changes never get tutorial entries.
3. **Commit and push the code first.** After the code change is complete
   (with its CHANGELOG / tutorial entries), commit and push it to `master`
   before any build. Code is never left uncommitted while an APK is built.
4. **Build the APK only after approval.** **Ask** (with `question`) whether to
   build the APK; do **not** run the build until the user approves. When
   approved, `npm run apk:build` builds both variants
   (`.apk-download/SnTFieldlogbook-v<version>.apk` and `...v<version>p.apk`)
   and stages them in `.apk-download/`. Never skip the build or the staging
   step for an approved build.
5. **Commit and push the APKs.** After the build, commit the staged APKs
   (together with any `.apk-download/index.html` update) and push them to
   `origin` — a separate commit after the code commit.
6. **Publish GitHub releases.** Do **not** publish GitHub releases until the
   user confirms the change works (and asks to publish). When publishing, each
   variant gets its own release — tag `v<version>` (title "S&T Field Logbook
   v<version>") and tag `v<version>p` (title "S&T Field Logbook v<version>p
   (owner personal build)") — with the matching APK attached and the notes
   taken from that version's `CHANGELOG.md` entry. The newest `p` release is
   marked Latest.
7. **Signing verification is not required** in general. Only a brand-new agent
   verifies the signing with `apksigner` (SHA-1
   `7B:C9:5F:C1:7F:0F:E4:93:52:1B:48:09:54:46:13:48:4E:73:B7:81`) on its
   **first** build of a session; all later builds skip the check.

## 3. Changes must always be committed and pushed

- Every change (code, docs, changelog) is committed to `master` and pushed to
  `origin` (mandatory).
- Push only works via the repo-local credential helper
  (`credential.helper=!gh auth git-credential`); `gh` is logged in as
  `emdaslam`.
- Do NOT publish GitHub releases until the user confirms the change works.
- After a change is committed and pushed, **ask** (with `question`) whether to
  prune the old APKs from `.apk-download/`. Pruning is allowed only for
  versions that are already published as GitHub releases. Before pruning, check
  `gh release list` against every APK still present in `.apk-download/`: a
  version is safe to prune only when **both** its variants have a release —
  tag `v<version>` and tag `v<version>p`, each with its APK attached. If any
  version in `.apk-download/` is not yet released, publish the GitHub releases
  for it first (both variants, notes from `CHANGELOG.md`, newest `p` marked
  Latest), and only then prune.
- When pruning is approved, keep only the latest 5 of each variant — the 5
  newest `SnTFieldlogbook-v….apk` and the 5 newest `SnTFieldlogbook-v…p.apk` —
  delete the older `SnTFieldlogbook-v…apk` files, and trim
  `.apk-download/index.html` so it links only to files that still exist. Never
  remove `index.html`, `privacy.html`, `terms.html` or other non-APK files.

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

## 5. Ponytail, lazy senior dev mode

You are a lazy senior developer. Lazy means efficient, not careless. The best
code is the code never written.

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern
   that's already here, don't re-write it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the
task and the code it touches, trace the real flow end to end, then climb.

Bug fix = root cause, not symptom: a report names a symptom. Grep every caller
of the function you touch and fix the shared function once — one guard there is
a smaller diff than one per caller, and patching only the path the ticket names
leaves a sibling caller still broken.

Rules:

- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins, but only once you understand the problem. The
  smallest change in the wrong place isn't lazy, it's a second bug.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- Pick the edge-case-correct option when two stdlib approaches are the same
  size, lazy means less code, not the flimsier algorithm.
- Mark deliberate simplifications that cut a real corner with a known ceiling
  (global lock, O(n²) scan, naive heuristic) with a `ponytail:` comment naming
  the ceiling and upgrade path.

Not lazy about: understanding the problem (read it fully and trace the real
flow before picking a rung, a small diff you don't understand is just laziness
dressed up as efficiency), input validation at trust boundaries, error handling
that prevents data loss, security, accessibility, the calibration real hardware
needs (the platform is never the spec ideal, a clock drifts, a sensor reads
off), anything explicitly requested. Lazy code without its check is unfinished:
non-trivial logic leaves ONE runnable check behind, the smallest thing that
fails if the logic breaks (an assert-based demo/self-check or one small test
file; no frameworks, no fixtures). Trivial one-liners need no test.

Source: https://github.com/DietrichGebert/ponytail (MIT).
