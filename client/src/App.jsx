import React, { useState, useRef, useEffect } from "react";
import SplashScreen from "./SplashScreen";
import Login from "./Login";
import Register from "./Register";
import EspositoriApp from "./EspositoriApp";
import Stampanti from "./Stampanti";
import Protek from "./Protek"; // <--- AGGIUNTO

export default function App() {
  const [view, setView] = useState("login");
 
  const currentUser = sessionStorage.getItem("currentUser");

  const handleContinue = () => {
    if (currentUser) {
      setView("app");
    } else {
      setView("login");
    }
  };

  const handleShowStampanti = () => {
    setView("stampanti");
  };

  const handleShowProtek = () => {
    setView("protek");
  };

  const handleRegister = async (newUser) => {
    try {
      const response = await fetch("http://192.168.1.250:3001/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await response.json();
      if (response.ok) {
        alert("Registrazione completata! Ora puoi effettuare il login.");
        setView("login");
      } else {
        alert(data.error || "Errore nella registrazione.");
      }
    } catch (error) {
      console.error("Errore durante la registrazione:", error);
      alert("Errore di connessione al server.");
    }
  };

  const handleLogin = async ({ email, password }) => {
    try {
      const response = await fetch("http://192.168.1.250:3001/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        sessionStorage.setItem("currentUser", JSON.stringify(data.user));
        setView("splash");
        
      } else {
        alert(data.error || "Credenziali non valide.");
      }
    } catch (error) {
      console.error("Errore durante il login:", error);
      alert("Errore di connessione al server.");
    }
  };

  const handleLogout = async () => {
    const currentUser = JSON.parse(sessionStorage.getItem("currentUser"));
    try {
      await fetch("http://192.168.1.250:3001/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser.email }),
      });
    } catch (error) {
      console.error("Errore durante il logout:", error);
    } finally {
      
      sessionStorage.removeItem("currentUser");
      setView("login");
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const navEntries = performance.getEntriesByType("navigation");
      const navType =
        navEntries && navEntries.length > 0 ? navEntries[0].type : null;
      if (navType !== "reload") {
        const currentUser = sessionStorage.getItem("currentUser");
        if (currentUser) {
          const { email } = JSON.parse(currentUser);
          navigator.sendBeacon(
            "http://192.168.1.250:3001/api/logout",
            JSON.stringify({ email })
          );
          sessionStorage.removeItem("currentUser");
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("unload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("unload", handleBeforeUnload);
    };
  }, []);

  if (view === "app") {
    return <EspositoriApp onLogout={handleLogout} onHome={() => setView("splash")} />;
  } else if (view === "register") {
    return (
      <Register
        onRegister={handleRegister}
        onSwitchToLogin={() => setView("login")}
      />
    );
  } else if (view === "login") {
    return (
      <Login
        onLogin={handleLogin}
        onSwitchToRegister={() => setView("register")}
      />
    );
  } else if (view === "stampanti") {
    return <Stampanti onBack={() => setView("splash")} />;
  } else if (view === "protek") {
    return <Protek onBack={() => setView("splash")} />; // <--- AGGIUNTO
  } else if (view === "splash") {
    return (
      <SplashScreen
        onContinue={handleContinue}
        onShowStampanti={handleShowStampanti}
        onShowProtek={handleShowProtek} // <--- AGGIUNTO
      />
    );
  } else {
    return null;
  }
}
