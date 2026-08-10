import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted rather than fetched from Google: the app is installed on a phone and has to work
// offline, and a webfont request on every launch would also be a third party watching it open.
// Latin only — Portuguese accents live in Latin-1, and the phone falls back per glyph anyway.
import "@fontsource/fredoka/latin-500.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/nunito/latin-500.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-800.css";
import "./theme.css";
import { applyTheme, watchSystemTheme } from "./lib/theme";

// index.html already applied the theme before first paint; this re-applies for safety and keeps
// "follow phone" honest when the phone flips at sunset.
applyTheme();
watchSystemTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
