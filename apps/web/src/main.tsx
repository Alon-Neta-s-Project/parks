import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./i18n";
import "./styles/global.css";

// Claim the document's language and direction rather than assuming the host
// page declared them: the same bundle runs from index.html and from an embed.
document.documentElement.lang = "he";
document.documentElement.dir = "rtl";

const root = document.getElementById("root");
if (!root) throw new Error("root element missing from index.html");

createRoot(root).render(
  <StrictMode>
    {/* Hash routing so the built app also works opened from a single file,
        with no server to rewrite unknown paths onto index.html. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
