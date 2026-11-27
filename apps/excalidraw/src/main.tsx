import React from "react";
import ReactDOM from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import App from "./App";
import "./styles.css";

// Keep Excalidraw's fonts on our own domain instead of loading a third-party CDN.
window.EXCALIDRAW_ASSET_PATH = "/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
