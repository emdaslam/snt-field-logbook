#!/usr/bin/env bash
#
# Build the S&T Field Logbook APK variant(s) from a single source tree.
#
# Two APKs come out of the same code:
#   normal  —  timings are typed by hand in the daily log (v1.7.6.27)
#   p       —  timings are auto-generated from the TA rate + travel range
#              (v1.7.6.27p, the owner's personal build)
#
# The build-time flag NEXT_PUBLIC_TIMINGS_MODE is baked into each web bundle.
#
# Usage:
#   scripts/build-variants.sh [normal|p|both]   (default: both)
#
# Before building, ~/.android/debug.keystore must be the repo debug keystore
# (see ANDROID_APK_GUIDE.md §5.1). The version shown in Settings and the APK
# filename both come from APP_VERSION_BASE in src/lib/types.ts.

set -euo pipefail

cd "$(dirname "$0")/.."

VARIANT="${1:-both}"
JAVA_HOME="${JAVA_HOME:-/opt/jdk21}"

BASE_VERSION="$(grep -oP 'APP_VERSION_BASE = "\K[^"]+' src/lib/types.ts)"
VERSION_CODE="$(grep -oP 'versionCode \K[0-9]+' android/app/build.gradle)"

build_one() {
  local mode="$1"      # manual | auto
  local suffix="$2"    # "" for normal, "p" for personal
  local version="${BASE_VERSION}${suffix}"
  echo ""
  echo "===== Building v${version} (timings mode: ${mode}) ====="

  echo "--- Web bundle (MOBILE_EXPORT=1 next build) ---"
  MOBILE_EXPORT=1 NEXT_PUBLIC_TIMINGS_MODE="${mode}" npm run build

  echo "--- Sync web bundle into Android project ---"
  npx cap sync android

  echo "--- Gradle assembleDebug (versionCode ${VERSION_CODE}) ---"
  (cd android && APP_VERSION_NAME="${version}" JAVA_HOME="${JAVA_HOME}" ./gradlew assembleDebug)

  echo "--- Staging APK ---"
  cp android/app/build/outputs/apk/debug/app-debug.apk ".apk-download/SnTFieldlogbook-v${version}.apk"
  echo "Staged: .apk-download/SnTFieldlogbook-v${version}.apk"
}

case "${VARIANT}" in
  normal) build_one manual "" ;;
  p)      build_one auto "p" ;;
  both)   build_one manual ""; build_one auto "p" ;;
  *)
    echo "Unknown variant '${VARIANT}'. Use: normal | p | both" >&2
    exit 1
    ;;
esac

echo ""
echo "Done. APKs staged in .apk-download/"
