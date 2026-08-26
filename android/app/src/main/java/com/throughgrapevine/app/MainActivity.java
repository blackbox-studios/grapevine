package com.throughgrapevine.app;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // DEBUG ONLY: the WebView serves the app from https://localhost, and Chromium
        // blocks a secure page from fetching an insecure http:// URL (mixed content).
        // That's what stops the emulator from reaching a local http dev API. Allow it
        // only in debuggable builds — release builds keep Chromium's default block,
        // which is correct because production talks to the API over https.
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debuggable && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings()
                    .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }
}
