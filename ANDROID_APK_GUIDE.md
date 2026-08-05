# Railway S&T Field Logbook — Offline Android APK

A **completely offline** Android app: the whole web app is packaged inside the
APK and every record is stored in the phone's own storage (IndexedDB). There is
no server. The only network access is the **optional** Google Drive sync, which
pushes/pulls one backup file to the app's private Drive app-data folder on
request.

| App ID / package | `in.railway.snt.logbook` |
|---|---|
| App name | S&T Field Logbook |
| Web framework | Next.js (statically exported) + Capacitor 8 |
| Min Android | Android 7.0 (API 24) |
| Target SDK | 36 |

---

## 1. Prerequisites

- **Node.js** (>= 20) and npm
- **JDK 21** (the project needs JDK 21; system JDK 17 is NOT enough — see the
  toolchain error below)
- **Android SDK 36** with **build-tools 36.0.0** and platform 36
  (Android Studio Ladybug+ installs this, or set `ANDROID_HOME` yourself)
- Java is the only extra requirement beyond `npm install`

---

## 2. Build the APK (command line)

```bash
# 1. Install dependencies
npm install

# 2. Build the offline web bundle and copy it into the Android project.
#    This runs:  MOBILE_EXPORT=1 next build  &&  npx cap sync android
npm run apk:sync

# 3. Compile the APK
cd android
JAVA_HOME=/path/to/jdk21 ./gradlew assembleDebug
```

Your APK:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

The exact same `JAVA_HOME` trick is used in the CI/preview environment here:
`JAVA_HOME=/opt/jdk21`. If `assembleDebug` fails with a missing Java toolchain,
you are on the wrong JDK — switch to 21.

> Always run `npx cap sync android` from the **project root** (the folder that
> contains `capacitor.config.json`). Running it inside `android/` fails with
> "android platform has not been added yet".

---

## 3. The web app is baked into the APK

Any change to `src/` requires a rebuild, or the APK keeps the old web app:

```bash
npm run apk:sync            # rebuild bundle + copy into android/
cd android && ./gradlew assembleDebug
```

---

## 4. App identity — get this right before building

### 4.1 Package name (applicationId)

`in.railway.snt.logbook` is defined in:

- `android/app/build.gradle` → `applicationId` and `namespace`
- `capacitor.config.json` → `appId`

### 4.2 Version

In `android/app/build.gradle`:

```gradle
versionCode 18
versionName "1.7.6.6"
```

**`versionCode` MUST increase for every build**, or Android refuses to install
over a previous build (`INSTALL_FAILED_VERSION_DOWNGRADE`). Current convention
in this repo: bump `1.7.6.x` → `1.7.6.y` (and `versionCode` by 1) for each fix.

---

## 5. Signing — the #1 cause of "conflicting package" / uninstall errors

Android identifies an app by **package name + signing certificate**. If two APKs
have the same package name but different signing keys, Android refuses to install
the second one over the first:

```
INSTALL_FAILED_UPDATE_INCOMPATIBLE
```

You must **uninstall the old app first** (which deletes its data on that phone
unless you backed up). This is exactly what happens when another developer
builds this repo with *their* debug keystore and installs over an existing copy.

### 5.1 The safest setup: everyone signs with the same key

The APKs published from this repo are signed with the **Android debug keystore**
whose fingerprint is:

```
SHA-1:   7B:C9:5F:C1:7F:0F:E4:93:52:1B:48:09:54:46:13:48:4E:73:B7:81
SHA-256: BC:28:7F:16:8B:BC:41:63:A9:68:D6:AB:5E:F9:85:81:4C:1F:FE:CA:E5:40:B4:46:C1:D4:26:09:C5:93:61:3B
```

If every collaborator builds with this same debug keystore, installs work without
uninstalling and Drive sync works unchanged.

**For a real rollout** use a shared **release keystore** instead (see section 7):
keep it in one safe place, and every release is signed with it. Anyone who builds
with a *different* key is effectively distributing a separate app:
- they can never install over the existing app without uninstalling first, and
- Google Drive sign-in will fail (`SIGN_IN_FAILED (10)` / DEVELOPER_ERROR) unless
  their keystore's SHA-1 is added to the Google Cloud Android client (section 6).

### 5.2 Checking a keystore's fingerprint

```bash
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android | grep SHA1
```

### 5.3 The rule of thumb

- Same package + same key  → install-over-works
- Same package + different key → **must uninstall first** (data loss on that device)
- Different package (changed `applicationId`) → installs side-by-side, but then
  the Google Cloud Android client must be recreated for the new package name

---

## 6. Google Drive sync — required setup (one-time, ~5 minutes)

The Drive sync is a **custom Capacitor plugin** in the repo
(`android/app/src/main/java/in/railway/snt/logbook/drive/GoogleDrivePlugin.java`)
and reads its client ID from
`android/app/src/main/res/values/google_drive_config.xml`.

### 6.1 Google Cloud project data (already configured)

| Item | Value |
|---|---|
| Project | `snt-logbook` (project number `592035474520`) |
| Drive API | enabled |
| **Android OAuth client** | package `in.railway.snt.logbook`, SHA-1 `7B:C9:5F:C1:7F:0F:E4:93:52:1B:48:09:54:46:13:48:4E:73:B7:81` |
| **Web OAuth client** (used for the ID token) | `592035474520-7ud4a7c4ukpcubnk9auoqbhcotnk5ksk.apps.googleusercontent.com` |
| Consent screen | External, **Testing** mode — each signing account must be added as a **Test user** |
| Scope | `https://www.googleapis.com/auth/drive.appdata` (hidden app-data folder) |

The web client ID is stored in `google_drive_config.xml`:

```xml
<string name="google_server_client_id">592035474520-7ud4a7c4ukpcubnk9auoqbhcotnk5ksk.apps.googleusercontent.com</string>
```

### 6.2 Setting it up on a new project (or when someone uses a different key)

1. Create a Google Cloud project; enable the **Google Drive API**.
2. **OAuth consent screen** → External → add each account that will sign in as a
   **Test user**. (The app is unverified; in Testing mode only listed accounts
   can sign in.)
3. **Credentials → Create credentials → OAuth client ID → Android** with exactly:
   - Package name: `in.railway.snt.logbook`
   - SHA-1: the fingerprint of **the keystore used to sign the APK** (section 5)
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Copy the **Web** client ID (NOT the Android one) into
   `android/app/src/main/res/values/google_drive_config.xml`.
   - Format: `<project-number>-<random>.apps.googleusercontent.com`
   - **It must have NO prefix** (a stray `cli` before the number causes
     `SIGN_IN_FAILED (10)` after the consent screen).
5. Both clients must live in the **same project** as the consent screen.

### 6.3 Known failure signatures (learned the hard way)

| Symptom | Cause | Fix |
|---|---|---|
| "Not configured" in Settings | GoogleDrive plugin not registered (registerPlugin called **after** `super.onCreate`) | Do not move the `registerPlugin(GoogleDrivePlugin.class)` line above `super.onCreate()` in `MainActivity.java` |
| Consent screen, then error `10` | Web client ID wrong / has `cli` prefix / wrong project, or Android client SHA-1 missing | Check section 6.2 |
| "Could not determine the signed-in Google account" | Cached sign-in with empty profile fields | Plugin already falls back to the device Google account + ID-token email |
| "Upload to Drive failed (403)" | New file created without the `appDataFolder` parent | Already fixed via multipart upload with `parents: ["appDataFolder"]` |

### 6.4 Data model note

The Drive backup is one JSON file (`snt-logbook-backup.json`) in the app-data
folder — it is **hidden** from the user's normal Drive view. Everything,
including per-tag reminder settings, is inside the backup's tables.

Sync rule: **last-write-wins** by the backup's `exportedAt` stamp. Sync never
overwrites the Drive copy when the local version stamp is unknown (fresh install)
— it restores the Drive copy first.

---

## 7. Release APK (for distributing to staff)

1. **Create a signing key** — once. Keep it safe; you need the same key for every
   future update so staff can install over previous versions.

   ```bash
   keytool -genkey -v -keystore snt-release.keystore \
     -alias snt -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create **`android/keystore.properties`** (never commit it):

   ```properties
   storeFile=../snt-release.keystore
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=snt
   keyPassword=YOUR_KEY_PASSWORD
   ```

3. Add to **`android/app/build.gradle`** inside `android { … }`:

   ```gradle
   def keystorePropertiesFile = rootProject.file("keystore.properties")
   def keystoreProperties = new Properties()
   if (keystorePropertiesFile.exists()) {
       keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
   }

   signingConfigs {
       release {
           if (keystorePropertiesFile.exists()) {
               storeFile file(keystoreProperties['storeFile'])
               storePassword keystoreProperties['storePassword']
               keyAlias keystoreProperties['keyAlias']
               keyPassword keystoreProperties['keyPassword']
           }
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
           minifyEnabled false
       }
   }
   ```

4. Build:

   ```bash
   cd android && ./gradlew assembleRelease
   ```

   → `android/app/build/outputs/apk/release/app-release.apk`

5. **IMPORTANT:** if you sign with a release key, add **its SHA-1** to the
   Google Cloud Android OAuth client (section 6.2, step 3), otherwise Drive sync
   sign-in fails with error 10.

Never commit `snt-release.keystore` or `keystore.properties`.

---

## 8. The GoogleDrive plugin (don't break it)

`android/app/src/main/java/in/railway/snt/logbook/drive/GoogleDrivePlugin.java`
is a project-local Capacitor plugin. It is registered in
`MainActivity.java` **before** `super.onCreate()` — the Capacitor bridge is built
during `super.onCreate()`, so registering afterwards silently drops the plugin
(which shows as "Not configured" in Settings). Keep that ordering.

The plugin signs in, requests an OAuth2 access token scoped to
`drive.appdata`, and hands it to the web layer, which talks to the Drive REST API
from `src/lib/drive.ts`.

---

## 9. Permissions declared

| Permission | Why |
|---|---|
| `INTERNET` | Only for the optional Google Drive sync API calls |
| `GET_ACCOUNTS` | Resolving the signed-in Google account for the Drive token |
| `POST_NOTIFICATIONS` | Inspection and deficiency reminders |
| `CAMERA`, `READ_MEDIA_IMAGES` | Attaching photos to daily logs |
| `WRITE_EXTERNAL_STORAGE` (≤ API 28) | Saving PDFs and backups on older Android |

---

## 10. Customising

| What | Where |
|---|---|
| App name | `android/app/src/main/res/values/strings.xml` |
| Package / app ID | `applicationId` in `android/app/build.gradle` + `appId` in `capacitor.config.json` |
| Version | `versionCode` / `versionName` in `android/app/build.gradle` |
| Theme colours | `android/app/src/main/res/values/colors.xml` |
| Drive web client ID | `android/app/src/main/res/values/google_drive_config.xml` |
| Launcher icon | Right-click `res` ▸ *New* ▸ *Image Asset* |

---

## 11. Troubleshooting

**Gradle sync fails on first open**
Let Android Studio install the SDK components it prompts for, then
*File ▸ Sync Project with Gradle Files*.

**assembleDebug fails with a Java toolchain error**
You're on JDK 17; the build needs JDK 21. Set `JAVA_HOME` to a JDK 21.

**`cap sync` says "android platform has not been added yet"**
Run it from the project root, not from `android/`.

**Blank screen after install**
Run `npm run apk:sync` before building — the bundle must exist in
`android/app/src/main/assets/public`.

**INSTALL_FAILED_UPDATE_INCOMPATIBLE on install**
The existing install was signed with a different key. Uninstall the old app
first (back up first), or switch everyone to the same signing key (section 5).

**Drive sign-in error 10 after the consent screen**
Web client ID wrong/`cli` prefix/missing Android client SHA-1. See section 6.2.

**App shows no data after reinstalling**
Uninstalling clears the device database. Restore from your JSON backup or,
if you use Drive sync, sign in and tap **Import from Drive**.

**PDF didn't appear**
Files are written to the **Documents** folder. Use the *Share* option to send it
straight to WhatsApp/Telegram instead of hunting for the file.
