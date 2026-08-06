package in.railway.snt.logbook.save;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * Capacitor bridge for saving files to a user-chosen location via Android's
 * Storage Access Framework (ACTION_CREATE_DOCUMENT). Android 10+ scoped
 * storage blocks direct writes to public folders such as /Documents, so PDFs
 * and backups are written through the system "Save to…" picker instead — no
 * storage permissions are needed because the picker grants access to the
 * chosen file.
 */
@CapacitorPlugin(name = "DocumentSave")
public class DocumentSavePlugin extends Plugin {

    /** Base64 payload handed over when the picker intent is launched. */
    private byte[] pendingData;

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String data = call.getString("data");

        if (filename == null || filename.isEmpty() || data == null) {
            call.reject("filename and data are required");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("data is not valid base64");
            return;
        }
        pendingData = bytes;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        // Open the picker on the Documents folder when the provider supports it.
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
        byte[] bytes = pendingData;
        pendingData = null;

        if (result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null
                || result.getData().getData() == null) {
            call.reject("Save cancelled");
            return;
        }

        Uri uri = result.getData().getData();
        ContentResolver resolver = getContext().getContentResolver();
        try {
            OutputStream out = resolver.openOutputStream(uri, "w");
            if (out == null) {
                call.reject("Could not open the chosen file for writing");
                return;
            }
            out.write(bytes);
            out.flush();
            out.close();
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("Could not save the file: " + e.getMessage());
        }
    }
}
