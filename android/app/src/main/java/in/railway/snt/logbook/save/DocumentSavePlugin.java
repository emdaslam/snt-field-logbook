package in.railway.snt.logbook.save;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Capacitor bridge for saving files to a user-chosen location via Android's
 * Storage Access Framework (ACTION_CREATE_DOCUMENT). The payload is written to
 * the app cache first so the system picker can recreate the activity without
 * dropping the bytes (which used to leave a 0-byte file and crash the app).
 */
@CapacitorPlugin(name = "DocumentSave")
public class DocumentSavePlugin extends Plugin {

    static final String PENDING_FILE = "pending-save.bin";

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String cacheFile = call.getString("cacheFile", PENDING_FILE);

        if (filename == null || filename.isEmpty()) {
            call.reject("filename is required");
            return;
        }
        if (cacheFile == null || cacheFile.isEmpty() || cacheFile.contains("/") || cacheFile.contains("..")) {
            cacheFile = PENDING_FILE;
        }

        File src = new File(getContext().getCacheDir(), cacheFile);
        if (!src.isFile() || src.length() == 0) {
            call.reject("Save data missing — please try again");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.putExtra(
                    DocumentsContract.EXTRA_INITIAL_URI,
                    Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADocuments"));
        }

        startActivityForResult(call, intent, "createDocument");
    }

    @ActivityCallback
    private void createDocument(PluginCall call, ActivityResult result) {
        if (call == null || call.isReleased()) return;

        if (result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null
                || result.getData().getData() == null) {
            call.reject("Save cancelled");
            return;
        }

        String cacheFile = call.getString("cacheFile", PENDING_FILE);
        if (cacheFile == null || cacheFile.isEmpty() || cacheFile.contains("/") || cacheFile.contains("..")) {
            cacheFile = PENDING_FILE;
        }
        File src = new File(getContext().getCacheDir(), cacheFile);
        if (!src.isFile() || src.length() == 0) {
            call.reject("Save data missing — please try again");
            return;
        }

        Uri uri = result.getData().getData();
        ContentResolver resolver = getContext().getContentResolver();
        try (InputStream in = new FileInputStream(src);
                OutputStream out = resolver.openOutputStream(uri, "w")) {
            if (out == null) {
                call.reject("Could not open the chosen file for writing");
                return;
            }
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            out.flush();
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("Could not save the file: " + e.getMessage());
        }
    }
}
