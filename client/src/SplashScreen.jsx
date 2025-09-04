import React from "react";
import { FilePlus, Printer } from "lucide-react";
import './SplashScreen.css';  // Import CSS esterno

export default function SplashScreen({ onContinue, onShowStampanti, onShowProtek }) {
  const viewportHeight = window.innerHeight;
  const circleDiameter = Math.round(0.7 * viewportHeight);
  const circleRadius = circleDiameter / 2;

  // Dimensione fissa dei bottoni: più grandi e tutti uguali tondi
  const iconDiameter = 70;
  const svgSize = 36;

  // Colore dell'alone (outline) usato da tutti i bottoni
  const outlineColor = "rgba(83, 199, 255, 0.7)"; // un azzurro chiaro simile al glow

  const iconData = [
    {
      label: "Gestione\nCommesse",
      renderIcon: () => <FilePlus size={svgSize} color="white" strokeWidth={2} />,
      onClick: onContinue,
    },
    {
      label: "1",
      renderIcon: () => (
        <div style={{ fontSize: svgSize * 0.8, color: "white", fontWeight: "bold", lineHeight: 1 }}>
          1
        </div>
      ),
      onClick: () => console.log("Icona 1"),
    },
    {
      label: "Protek",
      renderIcon: () => (
        <svg
          width={svgSize}
          height={svgSize}
          viewBox="0 0 48 48"
          fill="none"
          stroke="white"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "block" }}
        >
          {/* Tavolo */}
          <rect x="8" y="28" width="32" height="8" rx="1.5" />
          {/* Gambe tavolo */}
          <line x1="12" y1="36" x2="12" y2="44" />
          <line x1="36" y1="36" x2="36" y2="44" />
          {/* Ponte CNC */}
          <rect x="14" y="16" width="20" height="8" rx="2" />
          {/* Testa pantografo */}
          <rect x="22" y="6" width="4" height="10" rx="1.3" />
          {/* Maniglia/gancho sopra */}
          <path d="M24 6 Q24 3 28 3 Q32 3 32 6" />
          {/* Carrello Z */}
          <rect x="23" y="16" width="2" height="8" rx="0.7" />
          {/* Utensile/fresa */}
          <line x1="24" y1="24" x2="24" y2="32" />
          <circle cx="24" cy="34" r="1.5" fill="white" />
        </svg>
      ),
      onClick: onShowProtek, // <-- collegamento view Protek!
    },
    {
      label: "Stampanti",
      renderIcon: () => <Printer size={svgSize} color="white" strokeWidth={2} />,
      onClick: onShowStampanti,
    },
    {
      label: "4",
      renderIcon: () => (
        <div style={{ fontSize: svgSize * 0.8, color: "white", fontWeight: "bold", lineHeight: 1 }}>
          4
        </div>
      ),
      onClick: () => console.log("Icona 4"),
    },
    {
      label: "5",
      renderIcon: () => (
        <div style={{ fontSize: svgSize * 0.8, color: "white", fontWeight: "bold", lineHeight: 1 }}>
          5
        </div>
      ),
      onClick: () => console.log("Icona 5"),
    },
  ];

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      backgroundColor: "#121212",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        width: circleDiameter,
        height: circleDiameter,
        borderRadius: "50%",
        position: "relative",
        boxShadow: `0 0 40px 15px ${outlineColor}`, // alone grande
        background: "#000"
      }}>
        {iconData.map((icon, idx) => {
          const angle = -90 + (360 / iconData.length) * idx;
          const rad = (angle * Math.PI) / 180;
          const x = circleRadius + circleRadius * Math.cos(rad) - iconDiameter / 2;
          const y = circleRadius + circleRadius * Math.sin(rad) - iconDiameter / 2;

          return (
            <div
              key={idx}
              onClick={icon.onClick}
              className="icon-dot"
              style={{
                position: "absolute",
                left: Math.round(x),
                top: Math.round(y),
                userSelect: "none",
                backgroundColor: "#121212",
                borderColor: outlineColor,
                borderStyle: 'solid',
                borderWidth: 2,
                width: iconDiameter,
                height: iconDiameter,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "transform 0.3s ease, box-shadow 0.3s ease",
                boxShadow: `0 4px 15px ${outlineColor}, inset 0 0 10px white`,
                zIndex: 1,
              }}
              title={icon.label.replace("\n", " ")}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.15)";
                e.currentTarget.style.boxShadow = `0 0 30px 15px ${outlineColor}, inset 0 0 20px white`;
                e.currentTarget.style.zIndex = 10;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = `0 4px 15px ${outlineColor}, inset 0 0 10px white`;
                e.currentTarget.style.zIndex = 1;
              }}
            >
              {/* Icona bianca centrata senza sfondo */}
              <div
                style={{
                  width: "70%",
                  height: "70%",
                  borderRadius: "50%",
                  backgroundColor: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "none",
                  pointerEvents: "none",
                }}
              >
                {icon.renderIcon()}
              </div>

              {/* Testo sempre esterno e distanziato dal bottone */}
              <span className="icon-label">
                {icon.label}
              </span>
            </div>
          );
        })}

        <img
          src="/Logo Arca.png"
          alt="Logo"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            maxWidth: 240,
            height: "auto",
            filter: `drop-shadow(0 0 15px ${outlineColor})`,
          }}
          className="logo-glow"
        />
      </div>
    </div>
  );
}
