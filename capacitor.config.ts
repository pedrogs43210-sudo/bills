import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Wraps the built web app as native iOS and Android apps.
 *
 * `appId` is permanent once the app is first submitted — neither store lets it change, and a new
 * id is a new app with no reviews and no existing users. Worth being sure of before the first
 * upload.
 */
const config: CapacitorConfig = {
  appId: "app.billy.split",
  appName: "Billy",
  webDir: "dist",
  // The web assets are bundled into the app, so the served origin is capacitor://localhost on
  // iOS and https://localhost on Android. Both need adding to ALLOWED_ORIGINS on the scan proxy
  // or every scan is refused by CORS.
  android: {
    // Lets the WebView talk to https://localhost, which is how Android serves the bundle.
    allowMixedContent: false,
  },
  ios: {
    // The status bar sits over the web view; the app already pads for safe areas via
    // env(safe-area-inset-*) in theme.css.
    contentInset: "never",
  },
};

export default config;
