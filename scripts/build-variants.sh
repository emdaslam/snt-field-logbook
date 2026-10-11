#!/usr/bin/env bash
#
# Build the S&T Field Logbook APK from a single source tree.
#
# One APK line since the single-variant change (first applied to 1.7.8.10):
#   timings are auto-generated from the TA rate + station travel range, and
#   the version carries no suffix (v1.7.8.10, not v1.7.8.10p).
#
# The build-time flag NEXT_PUBLIC_TIMINGS_MODE is baked into the web bundle.
#
# Before building, ~/.android/debug.keystore must be the repo debug keystore
# (see ANDROID_APK_GUIDE.md §5.1). The version shown in Settings and the APK
# filename both come from APP_VERSION_BASE in src/lib/types.ts.

set -euo pipefail

cd "$(dirname "$0")/.."

JAVA_HOME="${JAVA_HOME:-/opt/jdk21}"

BASE_VERSION="$(grep -oP 'APP_VERSION_BASE = "\K[^"]+' src/lib/types.ts)"
VERSION_CODE="$(grep -oP 'versionCode \K[0-9]+' android/app/build.gradle)"

echo ""
echo "===== Building v${BASE_VERSION} (timings mode: auto) ====="

echo "--- Web bundle (MOBILE_EXPORT=1 next build) ---"
MOBILE_EXPORT=1 NEXT_PUBLIC_TIMINGS_MODE="auto" npm run build

echo "--- Sync web bundle into Android project ---"
npx cap sync android

echo "--- Gradle assembleDebug (versionCode ${VERSION_CODE}) ---"
(cd android && APP_VERSION_NAME="${BASE_VERSION}" JAVA_HOME="${JAVA_HOME}" ./gradlew assembleDebug)

echo "--- Staging APK ---"
cp android/app/build/outputs/apk/debug/app-debug.apk ".apk-download/SnTFieldlogbook-v${BASE_VERSION}.apk"
echo "Staged: .apk-download/SnTFieldlogbook-v${BASE_VERSION}.apk"

echo ""
echo "Done. APK staged in .apk-download/"
