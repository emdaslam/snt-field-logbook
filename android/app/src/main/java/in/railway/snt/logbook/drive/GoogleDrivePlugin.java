package in.railway.snt.logbook.drive;

import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.UserRecoverableAuthException;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import in.railway.snt.logbook.R;

/**
 * Capacitor bridge to Google Sign-In. The user picks an account, the plugin
 * returns an OAuth2 access token scoped to the Drive app-data folder, and the
 * web layer uses that token to read/write the backup file over the Drive REST
 * API. Sign-in never hands passwords or token values back to the server.
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {

    private static final String DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

    private boolean configured() {
        String id = getContext().getString(R.string.google_server_client_id);
        return id != null && !id.isEmpty() && !id.startsWith("YOUR_");
    }

    private GoogleSignInClient signInClient() {
        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(getContext().getString(R.string.google_server_client_id))
                .requestScopes(new Scope(DRIVE_APPDATA_SCOPE))
                .build();
        return GoogleSignIn.getClient(getActivity(), options);
    }

    @PluginMethod
    public void isConfigured(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("configured", configured());
        call.resolve(ret);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!configured()) {
            call.reject("Google Drive sync is not configured on this build");
            return;
        }
        startActivityForResult(call, signInClient().getSignInIntent(), "signInResult");
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        signInClient()
                .signOut()
                .addOnCompleteListener(task -> call.resolve());
    }

    @ActivityCallback
    private void signInResult(PluginCall call, ActivityResult result) {
        if (call == null || call.isReleased()) return;
        try {
            GoogleSignInAccount account = GoogleSignIn.getSignedInAccountFromIntent(result.getData())
                    .getResult(ApiException.class);
            fetchAccessToken(call, account);
        } catch (ApiException e) {
            call.reject("Google sign-in failed (" + e.getStatusCode() + ")");
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Google sign-in failed");
        }
    }

    @ActivityCallback
    private void authResult(PluginCall call, ActivityResult result) {
        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(getContext());
        if (account == null) {
            call.reject("No Google account selected");
            return;
        }
        fetchAccessToken(call, account);
    }

    private void fetchAccessToken(final PluginCall call, final GoogleSignInAccount account) {
        new Thread(() -> {
            try {
                final String token = GoogleAuthUtil.getToken(
                        getContext(),
                        account.getAccount(),
                        "oauth2:" + DRIVE_APPDATA_SCOPE);
                getActivity().runOnUiThread(() -> {
                    JSObject ret = new JSObject();
                    ret.put("accessToken", token);
                    ret.put("email", account.getEmail());
                    ret.put("displayName", account.getDisplayName());
                    call.resolve(ret);
                });
            } catch (final UserRecoverableAuthException e) {
                getActivity().runOnUiThread(() ->
                        startActivityForResult(call, e.getIntent(), "authResult"));
            } catch (final Exception e) {
                getActivity().runOnUiThread(() ->
                        call.reject(e.getMessage() != null ? e.getMessage() : "Could not get Drive access"));
            }
        }).start();
    }
}
