// Uso: showCriticalAlert("Impossibile generare la bolla di ENTRATA.", debugStringOptional);
export default function showCriticalAlert(message, debugText = "") {
  try {
    const id = "critical-alert-overlay";
    if (document.getElementById(id)) document.getElementById(id).remove();

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.zIndex = "99999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const box = document.createElement("div");
    box.style.width = "min(780px, 92vw)";
    box.style.maxHeight = "84vh";
    box.style.overflow = "auto";
    box.style.background = "#fff";
    box.style.borderRadius = "16px";
    box.style.boxShadow = "0 20px 60px rgba(0,0,0,.35)";
    box.style.border = "3px solid #c62828";

    box.innerHTML = `
      <div style="padding:22px 20px 6px 20px; display:flex; gap:12px; align-items:center">
        <div style="width:46px; height:46px; background:#c62828; color:#fff; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:900">!</div>
        <div style="font-size:1.35rem; font-weight:800; color:#c62828; letter-spacing:.3px">
          ERRORE CRITICO
        </div>
      </div>
      <div style="padding:8px 22px 6px 22px; color:#222; font-size:1.05rem; line-height:1.35">
        <div style="margin:6px 0 2px 0; font-weight:700">${escapeHtml(message)}</div>
        <div style="margin:2px 0 10px 0;">Contatta l'amministratore di sistema.</div>
        ${debugText ? `
          <details style="background:#fff3f3; border:1px solid #ffcdd2; padding:10px 12px; border-radius:10px; margin:8px 0 14px 0">
            <summary style="cursor:pointer; color:#b71c1c; font-weight:700">Dettagli tecnici (debug)</summary>
            <pre style="white-space:pre-wrap; font-size:.92rem; color:#444; margin-top:10px">${escapeHtml(debugText)}</pre>
          </details>` : ""}
      </div>
      <div style="padding:0 22px 22px 22px; display:flex; gap:10px; justify-content:flex-end">
        ${debugText ? `<button id="btnCopyDebug"
          style="background:#455a64; color:#fff; border:none; border-radius:10px; padding:10px 14px; font-weight:700; cursor:pointer">Copia debug</button>` : ""}
        <a href="mailto:admin@azienda.local?subject=Errore%20App%20Commesse&body=${encodeURIComponent((message||"") + "\n\n" + (debugText||""))}"
           style="text-decoration:none">
          <button
            style="background:#c62828; color:#fff; border:none; border-radius:10px; padding:10px 16px; font-weight:800; cursor:pointer">
            Contatta amministratore
          </button>
        </a>
        <button id="btnCloseAlert"
          style="background:#888; color:#fff; border:none; border-radius:10px; padding:10px 16px; font-weight:700; cursor:pointer">
          Chiudi
        </button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    box.querySelector("#btnCloseAlert")?.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    const copyBtn = box.querySelector("#btnCopyDebug");
    if (copyBtn && debugText) {
      copyBtn.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(debugText); copyBtn.textContent = "Copiato ✓"; }
        catch { copyBtn.textContent = "Copia non riuscita"; }
        setTimeout(() => (copyBtn.textContent = "Copia debug"), 1500);
      });
    }
  } catch {
    // fallback
    window.alert(`${message}\n\nContatta l’amministratore di sistema.${debugText ? ("\n\n--- DEBUG ---\n" + debugText) : ""}`);
  }

  function escapeHtml(s = "") {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
}
