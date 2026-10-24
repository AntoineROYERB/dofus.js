import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { setUpNativeShell } from "./lib/native";
import { installAudio } from "./audio/engine";

setUpNativeShell();
installAudio();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
