import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DownloadPage } from "./components/DownloadPage";
import { installPressEffects } from "./lib/press";
import "./styles.css";
import "./download.css";

installPressEffects();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DownloadPage />
  </StrictMode>,
);
