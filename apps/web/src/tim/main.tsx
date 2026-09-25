import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TimOnlyApp from "./TimOnlyApp";
import "../i18n";
import "../styles/global.css";

// ⚠️ בלי HashRouter ובלי ניתוב בכלל. יש מסך אחד, וראוטר היה מושך את
// react-router לחבילה בשביל כלום.
document.documentElement.lang = "he";
document.documentElement.dir = "rtl";

const root = document.getElementById("root");
if (!root) throw new Error("root element missing from tim.html");

createRoot(root).render(
  <StrictMode>
    <TimOnlyApp />
  </StrictMode>,
);
