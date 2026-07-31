# Railway S&T Field Logbook — Offline Android APK

A **completely offline** Android app. No server, no website, no internet.
The whole application is packaged inside the APK and every record is stored in
the phone's own storage.

The app declares **no INTERNET permission**, so it physically cannot make a
network request.

---

## Build the APK in 3 steps

```bash
# 1. Build the offline bundle and copy it into the Android project
npm install
npm run apk:sync
```

```
# 2. Open Android Studio
File ▸ Open ▸ select the  android  folder   (not the project root)
```

```
# 3. Build
Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)
```

Your APK:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

Or from the terminal:
```bash
cd android && ./gradlew assembleDebug
```

**Requirements:** Android Studio Ladybug+, JDK 21, Android SDK 36.
Runs on Android 7.0 (API 24) and newer.

---

## How the offline app works

| Concern | How it's handled |
|---|---|
| Database | **IndexedDB** on the device (`snt-logbook`). No PostgreSQL, no server. |
| Web app | Statically exported and bundled into `assets/public` inside the APK. |
| PDF reports | Generated on-device with jsPDF, written to **Documents**, shared via Android's share sheet. |
| Backups | Exported/imported as a JSON file entirely on-device. |
| Photos | Stored inside the record as data URLs. |
| Reminders | Calculated locally from your entries each time the app opens. |

### What offline means for you

✅ Works with no signal, in tunnels, at remote stations
✅ Nothing leaves the phone — no account, no cloud, no tracking
✅ Starts instantly, no loading from a server

⚠️ **Data lives only on that phone.** There is no sync between staff members'
devices, because syncing requires a server. Each person keeps their own logbook.

⚠️ **Back up regularly.** If the phone is lost, reset, or the app is uninstalled,
the data goes with it. Use **Settings ▸ Data Backup & Restore ▸ Export Database
(JSON)** and keep the file somewhere safe. Importing it on a new phone restores
everything — that is also how you move to a new device or share a dataset with a
colleague.

---

## Release APK (for distributing to staff)

1. **Create a signing key** — once. Keep it safe; you need the same key for every future update.

   ```bash
   keytool -genkey -v -keystore snt-release.keystore \
     -alias snt -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create **`android/keystore.properties`**:

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

4. ```bash
   cd android && ./gradlew assembleRelease
   ```

   → `android/app/build/outputs/apk/release/app-release.apk`

Never commit `snt-release.keystore` or `keystore.properties`.

---

## Customising

| What | Where |
|---|---|
| App name | `android/app/src/main/res/values/strings.xml` |
| Package / app ID | `applicationId` in `android/app/build.gradle` + `appId` in `capacitor.config.json` |
| Version | `versionCode` / `versionName` in `android/app/build.gradle` |
| Theme colours | `android/app/src/main/res/values/colors.xml` |
| Launcher icon | Right-click `res` ▸ *New* ▸ *Image Asset* |

Increase `versionCode` by 1 for each release, or Android refuses to install over
the previous build.

---

## After changing the web app

The web code is **baked into the APK**, so any change needs a rebuild:

```bash
npm run apk:sync      # rebuild the bundle + copy into android/
cd android && ./gradlew assembleDebug
```

---

## Permissions declared

| Permission | Why |
|---|---|
| `CAMERA`, `READ_MEDIA_IMAGES` | Attaching photos to daily logs |
| `POST_NOTIFICATIONS` | Inspection and deficiency reminders |
| `WRITE_EXTERNAL_STORAGE` (≤ API 28) | Saving PDFs and backups on older Android |

There is deliberately **no `INTERNET` permission**.

---

## Troubleshooting

**Gradle sync fails on first open**
Let Android Studio install the SDK components it prompts for, then
*File ▸ Sync Project with Gradle Files*.

**Blank screen after install**
Run `npm run apk:sync` before building — the bundle must exist in
`android/app/src/main/assets/public`.

**App shows no data after reinstalling**
Uninstalling clears the device database. Restore from your JSON backup.

**PDF didn't appear**
Files are written to the **Documents** folder. Use the *Share* option to send it
straight to WhatsApp/Telegram instead of hunting for the file.
