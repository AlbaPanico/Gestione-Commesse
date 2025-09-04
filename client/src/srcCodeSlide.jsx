// src/CodeSlide.jsx
import React from "react";
import { Button } from "./components/ui/button";

export default function CodeSlide({ code, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "2rem",
        zIndex: 9999,
      }}
    >
      <div style={{ marginBottom: "1rem", textAlign: "right" }}>
        <Button onClick={onClose}>Chiudi</Button>
      </div>
      <pre
        style={{
          flex: 1,
          overflow: "auto",
          background: "#1e1e1e",
          color: "#eee",
          padding: "1rem",
          borderRadius: "8px",
          fontSize: "0.85rem",
        }}
      >
        {code}
      </pre>
    </div>
  );
}
