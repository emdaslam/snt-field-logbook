package in.railway.snt.logbook.drive;

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

import org.json.JSONObject;

import in.railway.snt.logbook.R;

/**
 * Capacitor bridge to Google Sign-In. The user picks an account, the plugin
 * returns an OAuth2 access token scoped to the Drive app-data folder, and the
 * web layer uses that token to read/write the backup file over the Drive REST
 * API. Sign-in never hands passwords or token values back to the server.
 *
 * Sessions persist across app restarts: Google remembers the last signed-in
 * account, so {@link #getAccessToken} can hand back a fresh token silently
 * (refreshing it if it expired) without ever showing an account picker. The
 * picker is only shown by {@link #signIn} when the user explicitly signs in
 * from Settings after signing out (or on a first install).
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {

    private static final String DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

    /**
     * The email of the account chosen during sign-in. It is remembered here
     * because after Google's scope-consent relaunch (authResult) the account
     * restored via getLastSignedInAccount() sometimes has no email/account.
     */
    private String signedInEmail;

    /**
     * The sign-in result sometimes returns an account whose email/profile
     * fields are empty (known Google Sign-In quirk for cached sign-ins). The
     * ID token always carries the email claim, so it is decoded as a fallback.
     */
    private static String emailFromIdToken(String idToken) {
        if (idToken == null) return null;
        try {
            String[] parts = idToken.split("\\.");
            if (parts.length < 2) return null;
            String payloadPart = parts[1];
            // JWT payloads are base64url without padding; Android's decoder
            // is picky, so re-pad before decoding.
            int mod = payloadPart.length() % 4;
            if (mod == 2) payloadPart += "==";
            else if (mod == 3) payloadPart += "=";
            byte[] payload = android.util.Base64.decode(payloadPart, android.util.Base64.URL_SAFE);
            JSONObject json = new JSONObject(new String(payload, "UTF-8"));
            String email = json.optString("email", null);
            return (email == null || email.isEmpty()) ? null : email;
        } catch (Exception e) {
            return null;
        }
    }

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

    /**
     * Show the Google account picker. Only called when the user explicitly
     * signs in (Settings) or when there is no usable session at all, so this
     * no longer forces signOut() first — that reset the remembered account and
     * made the app ask for a login on every sync.
     */
    @PluginMethod
    public void signIn(PluginCall call) {
        if (!configured()) {
            call.reject("Google Drive sync is not configured on this build");
            return;
        }
        signedInEmail = null;
        startActivityForResult(call, signInClient().getSignInIntent(), "signInResult");
    }

    /**
     * Silently hand back a fresh Drive access token for the previously
     * signed-in Google account, refreshing it if it has expired. No UI is
     * shown, so calling this on every sync keeps the user logged in until they
     * explicitly sign out. Rejects when there is no usable account (the user
     * signed out, or app data was cleared).
     *
     * @param email optional hint: the account the web layer last used, which
     *              pins the token to the right Google account.
     */
    @PluginMethod
    public void getAccessToken(PluginCall call) {
        final String emailHint = call.getString("email");
        new Thread(() -> {
            try {
                android.accounts.Account acct = resolveAccount(emailHint);
                if (acct == null) {
                    getActivity().runOnUiThread(() -> call.reject("Not signed in to Google"));
                    return;
                }
                final String token = GoogleAuthUtil.getToken(
                        getContext(), acct, "oauth2:" + DRIVE_APPDATA_SCOPE);
                final String resolvedEmail = acct.name;
                getActivity().runOnUiThread(() -> {
                    JSObject ret = new JSObject();
                    ret.put("accessToken", token);
                    ret.put("email", resolvedEmail);
                    ret.put("displayName", null);
                    call.resolve(ret);
                });
            } catch (final UserRecoverableAuthException e) {
                // Scope consent needed -> the web layer will fall back to the
                // interactive sign-in flow.
                getActivity().runOnUiThread(() -> call.reject("interactive login required"));
            } catch (final Exception e) {
                getActivity().runOnUiThread(() ->
                        call.reject(e.getMessage() != null ? e.getMessage() : "Could not refresh Drive access"));
            }
        }).start();
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        signInClient()
                .signOut()
                .addOnCompleteListener(task -> {
                    signedInEmail = null;
                    call.resolve();
                });
    }

    /**
     * Find the Google account to use for a silent token fetch. Prefers the
     * email the web layer last used (pinned to the account that actually holds
     * the Drive backup), then the SDK's last signed-in account, then a lone
     * Google account on the device.
     */
    private android.accounts.Account resolveAccount(String emailHint) {
        if (emailHint != null && !emailHint.isEmpty()) {
            try {
                android.accounts.Account[] accounts = android.accounts.AccountManager.get(getContext())
                        .getAccountsByType(GoogleAuthUtil.GOOGLE_ACCOUNT_TYPE);
                for (android.accounts.Account a : accounts) {
                    if (a.name.equalsIgnoreCase(emailHint)) {
                        return a;
                    }
                }
            } catch (Exception e) {
                /* fall through */
            }
        }
        GoogleSignInAccount last = GoogleSignIn.getLastSignedInAccount(getContext());
        if (last != null) {
            if (last.getEmail() != null && !last.getEmail().isEmpty()) {
                return new android.accounts.Account(last.getEmail(), GoogleAuthUtil.GOOGLE_ACCOUNT_TYPE);
            }
            if (last.getAccount() != null) {
                return last.getAccount();
            }
            String idEmail = emailFromIdToken(last.getIdToken());
            if (idEmail != null) {
                return new android.accounts.Account(idEmail, GoogleAuthUtil.GOOGLE_ACCOUNT_TYPE);
            }
        }
        if (signedInEmail != null) {
            return new android.accounts.Account(signedInEmail, GoogleAuthUtil.GOOGLE_ACCOUNT_TYPE);
        }
        return fallbackAccountFromDevice();
    }

    @ActivityCallback
    private void signInResult(PluginCall call, ActivityResult result) {
        if (call == null || call.isReleased()) return;
        try {
            GoogleSignInAccount account = GoogleSignIn.getSignedInAccountFromIntent(result.getData())
                    .getResult(ApiException.class);
            String email = resolveSignInEmail(account);
            if (email != null) {
                signedInEmail = email;
            }
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
        if (account != null) {
            String email = resolveSignInEmail(account);
            if (email != null) {
                signedInEmail = email;
            }
        }
        if (account == null && signedInEmail == null) {
            call.reject("No Google account selected");
            return;
        }
        fetchAccessToken(call, account);
    }

    /**
     * Best-effort email from a sign-in result account: try the account's email
     * field, then the account's Android account name, then the ID-token claim.
     */
    private static String resolveSignInEmail(GoogleSignInAccount account) {
        if (account == null) return null;
        if (account.getEmail() != null && !account.getEmail().isEmpty()) {
            return account.getEmail();
        }
        if (account.getAccount() != null) {
            return account.getAccount().name;
        }
        return emailFromIdToken(account.getIdToken());
    }

    private void fetchAccessToken(final PluginCall call, final GoogleSignInAccount account) {
        new Thread(() -> {
            try {
                String email = resolveSignInEmail(account);
                if (email == null) {
                    email = signedInEmail;
                }
                android.accounts.Account acct = account != null ? account.getAccount() : null;
                if (acct == null && email != null) {
                    acct = new android.accounts.Account(email, GoogleAuthUtil.GOOGLE_ACCOUNT_TYPE);
                }
                if (acct == null) {
                    acct = resolveAccount(null);
                    if (acct != null && email == null) {
                        email = acct.name;
                    }
                }
                if (acct == null) {
                    final String idTokenEmail = account != null ? emailFromIdToken(account.getIdToken()) : null;
                    android.accounts.Account[] googleAccounts = android.accounts.AccountManager.get(getContext())
                            .getAccountsByType(GoogleAuthUtil.GOOGLE_ACCOUNT_TYPE);
                    final String detail = "account=" + (account != null)
                            + ", hasAccount=" + (account != null && account.getAccount() != null)
                            + ", hasEmail=" + (account != null && account.getEmail() != null)
                            + ", hasIdToken=" + (account != null && account.getIdToken() != null)
                            + ", storedEmail=" + (signedInEmail != null)
                            + ", idTokenEmail=" + idTokenEmail
                            + ", googleAccounts=" + googleAccounts.length;
                    getActivity().runOnUiThread(() ->
                            call.reject("Could not determine the signed-in Google account (" + detail + ")"));
                    return;
                }
                final String token = GoogleAuthUtil.getToken(
                        getContext(),
                        acct,
                        "oauth2:" + DRIVE_APPDATA_SCOPE);
                final String resolvedEmail = email != null ? email : acct.name;
                getActivity().runOnUiThread(() -> {
                    JSObject ret = new JSObject();
                    ret.put("accessToken", token);
                    ret.put("email", resolvedEmail);
                    ret.put("displayName", account != null ? account.getDisplayName() : null);
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

    /**
     * Last-resort: the chosen Google account is always registered as an
     * Android account on the device, so use its name when the sign-in result
     * does not expose an email. Only unambiguous when there is one Google
     * account on the device.
     */
    private android.accounts.Account fallbackAccountFromDevice() {
        try {
            android.accounts.Account[] accounts = android.accounts.AccountManager.get(getContext())
                    .getAccountsByType(GoogleAuthUtil.GOOGLE_ACCOUNT_TYPE);
            if (accounts.length == 1) {
                return accounts[0];
            }
        } catch (Exception e) {
            /* permission or service error - leave null */
        }
        return null;
    }
}
