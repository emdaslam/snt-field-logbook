package in.railway.snt.logbook;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import in.railway.snt.logbook.drive.GoogleDrivePlugin;

/**
 * Railway S&T Field Logbook — offline-first.
 *
 * The entire web app is bundled inside the APK (assets/public) and all records
 * are stored in the device's own IndexedDB. The app is fully usable without
 * a network; the only network access is the optional Google Drive sync
 * (INTERNET permission) that pushes/pulls the backup file on request.
 *
 * PDF reports and JSON backups are written to the device with the Capacitor
 * Filesystem plugin and handed to Android's share sheet via the Share plugin,
 * which is how files reach WhatsApp / Telegram / Drive without any server.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleDrivePlugin.class);

        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();

        // Local storage powers the whole database — it must be enabled.
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setJavaScriptEnabled(true);

        // Attachments are read from the device as data URLs
        settings.setAllowFileAccess(true);

        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // Everything is packaged locally; never consult a network cache.
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        // Let the print view open
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
    }
}
