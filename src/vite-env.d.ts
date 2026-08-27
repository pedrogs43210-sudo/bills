/// <reference types="vite/client" />

/** Injected at build time from package.json — see vite.config.ts. */
declare const __APP_VERSION__: string;

/**
 * Build-time configuration.
 *
 * The two RevenueCat values are PUBLIC SDK keys — they identify the app to RevenueCat and are meant
 * to ship inside the binary, unlike VITE_APP_TOKEN or the Anthropic key. They are still read from
 * the environment so a fork does not inherit them and so either can be rotated without a code
 * change. Missing means "buying is not configured", which the app says out loud rather than
 * showing a button that opens nothing.
 */
interface ImportMetaEnv {
  readonly VITE_SCAN_PROXY_URL?: string;
  readonly VITE_APP_TOKEN?: string;
  readonly VITE_APP_LINK?: string;
  readonly VITE_RC_KEY_IOS?: string;
  readonly VITE_RC_KEY_ANDROID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
