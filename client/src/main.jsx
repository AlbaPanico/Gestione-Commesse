// src/main.jsx
import './setupGlobals.js';  // Assicurati che questo import rimanga in cima
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";       // Importa il nuovo componente App
import "./globals.css";         // Il tuo file CSS globale

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
